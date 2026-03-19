const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const InsightProcessor = require('./processor');
const YoutubeProcessor = require('./youtube_processor');

require('dotenv').config();
admin.initializeApp();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
    console.log(`[Request] ${req.method} ${req.path} | OriginalUrl: ${req.originalUrl}`);
    next();
});

app.get('/api/ping', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.get('/ping', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// En Cloud Run las keys llegan como env vars regulares (ya estaban configuradas antes del Secret Manager)
const getApifyKey = () => process.env.APIFY_API_KEY || '';
const getGeminiKey = () => process.env.GEMINI_API_KEY || '';

console.log('[Backend] Cloud Functions inicializadas. Apify key length:', getApifyKey().length);

const processor = new InsightProcessor();
const ytProcessor = new YoutubeProcessor();

// Helper: normaliza items de Apify al formato {text, author, followers}
// ─── Normalize comment items from any platform ──────────────────────────────
function normalizeApifyItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => ({
        text:      item.text || item.commentText || item.reviewText || item.message || item.comment || '',
        author:    item.uniqueId || item.ownerUsername || item.username || item.profileName || item.name || 'Usuario',
        followers: item.authorStats?.followerCount || item.authorMeta?.fans ||
                   item.owner?.followersCount || item.followersCount || 0,
        likes:     item.diggCount || item.likesCount || item.likes || item.thumbsUpCount || 0,
        date:      item.createTime ? new Date(item.createTime * 1000).toISOString()
                   : item.timestamp || item.createdAt || null,
    })).filter(c => c.text.trim().length > 5); // filtrar textos muy cortos
}

// ─── Helper: lanzar un actor Apify y esperar el resultado ───────────────────
async function runApifyActor(actorId, input, apifyKey) {
    const run = await axios.post(
        `https://api.apify.com/v2/acts/${actorId}/runs?token=${apifyKey}`, input
    );
    const runId = run.data.data.id;
    const datasetId = run.data.data.defaultDatasetId;

    let status = run.data.data.status;
    while (status === 'RUNNING' || status === 'READY') {
        await new Promise(r => setTimeout(r, 8000));
        const check = await axios.get(
            `https://api.apify.com/v2/acts/${actorId}/runs/${runId}?token=${apifyKey}`
        );
        status = check.data.data.status;
        if (status === 'ABORTED' || status === 'FAILED') throw new Error(`Scraper ${status}`);
    }

    const itemsRes = await axios.get(
        `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyKey}`
    );
    return Array.isArray(itemsRes.data) ? itemsRes.data : [];
}

// ─── TikTok: perfil → últimos N videos → comentarios + metadata ─────────────
async function scrapeTikTokComments(profileUrl, apifyKey, numVideos = 10) {
    // PASO 1: obtener videos recientes del perfil
    console.log(`[TikTok] Paso 1: obteniendo últimos ${numVideos} videos de ${profileUrl}`);
    const videos = await runApifyActor(
        'clockworks~free-tiktok-scraper',
        { profiles: [profileUrl], resultsPerPage: numVideos,
          shouldDownloadVideos: false, shouldDownloadCovers: false },
        apifyKey
    );

    const videoItems = videos.slice(0, numVideos);
    const videoUrls = videoItems
        .map(v => v.webVideoUrl || v.url || v.videoUrl)
        .filter(url => url && url.includes('tiktok.com'));

    // Guardar metadata de cada video para uso posterior
    const videoMeta = videoItems.map(v => ({
        url:         v.webVideoUrl || v.url || v.videoUrl || '',
        thumbnailUrl: v.coverUrl || v.thumbnail || '',
        description: (v.desc || v.text || '').slice(0, 200),
        platform:    'tiktok',
        likes:       v.stats?.diggCount || v.diggCount || 0,
        views:       v.stats?.playCount || v.playCount || 0,
        commentCount: v.stats?.commentCount || v.commentCount || 0,
    })).filter(v => v.url);

    if (videoUrls.length === 0) throw new Error('No se encontraron videos en el perfil TikTok');
    console.log(`[TikTok] Paso 2: extrayendo comentarios de ${videoUrls.length} videos`);

    // PASO 2: extraer comentarios de esos videos
    const rawComments = await runApifyActor(
        'clockworks~tiktok-comments-scraper',
        { postURLs: videoUrls, commentsPerPost: 20, maxRepliesPerComment: 0 },
        apifyKey
    );

    // Tagear cada comentario con su video de origen
    const comments = rawComments.map(c => ({
        ...c,
        sourceVideoUrl: c.postUrl || c.videoUrl || videoUrls[0] || '',
    }));

    console.log(`[TikTok] ${comments.length} comentarios obtenidos`);
    return { comments, videoMeta };
}

// ─── Instagram: perfil → últimos N posts → comentarios + metadata ────────────
async function scrapeInstagramComments(profileUrl, apifyKey, numPosts = 10) {
    // PASO 1: obtener posts recientes del perfil
    console.log(`[Instagram] Paso 1: obteniendo últimos ${numPosts} posts de ${profileUrl}`);
    const posts = await runApifyActor(
        'apify~instagram-scraper',
        { directUrls: [profileUrl], resultsType: 'posts', resultsLimit: numPosts, addParentData: false },
        apifyKey
    );

    const postItems = posts.slice(0, numPosts);
    const postUrls = postItems
        .map(p => p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : null))
        .filter(Boolean);

    // Metadata de cada post
    const videoMeta = postItems.map(p => ({
        url:          p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : ''),
        thumbnailUrl: p.displayUrl || p.thumbnailUrl || p.previewUrl || '',
        description:  (p.caption || p.text || '').slice(0, 200),
        platform:     'instagram',
        likes:        p.likesCount || p.likes || 0,
        views:        p.videoViewCount || p.videoPlayCount || 0,
        commentCount: p.commentsCount || 0,
    })).filter(v => v.url);

    if (postUrls.length === 0) throw new Error('No se encontraron posts en el perfil de Instagram');
    console.log(`[Instagram] Paso 2: extrayendo comentarios de ${postUrls.length} posts`);

    // PASO 2: intentar con jaroslavsemanko, fallback a apify~instagram-comment-scraper
    let rawComments = [];
    try {
        rawComments = await runApifyActor(
            'jaroslavsemanko~instagram-comment-scraper',
            { directUrls: postUrls, resultsLimit: 20 },
            apifyKey
        );
    } catch (e) {
        console.warn(`[Instagram] jaroslavsemanko falló (${e.message}), intentando actor alternativo...`);
        rawComments = await runApifyActor(
            'apify~instagram-comment-scraper',
            { directUrls: postUrls, resultsPerPost: 20 },
            apifyKey
        );
    }

    // Tagear cada comentario con su post de origen
    const comments = rawComments.map(c => ({
        ...c,
        sourceVideoUrl: c.postUrl || c.ownerUrl || postUrls[0] || '',
    }));

    console.log(`[Instagram] ${comments.length} comentarios obtenidos`);
    return { comments, videoMeta };
}



// Helper for dual routes (with and without /api prefix)
const registerRoute = (method, path, handler) => {
    app[method](path, handler);
    if (path.startsWith('/api')) {
        app[method](path.replace('/api', ''), handler);
    }
};

registerRoute('post', '/api/youtube/analyze', async (req, res) => {
    const { videoUrl } = req.body;
    try {
        console.log(`[YouTube] Analizando: ${videoUrl}`);

        // Validar URL de YouTube
        let videoId = '';
        if (videoUrl.includes('v='))         videoId = videoUrl.split('v=')[1]?.split('&')[0];
        else if (videoUrl.includes('youtu.be/')) videoId = videoUrl.split('youtu.be/')[1]?.split('?')[0];
        if (!videoId) throw new Error('URL de YouTube no válida. Usá https://www.youtube.com/watch?v=XXXX');

        const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
        console.log(`[YouTube] VideoId: ${videoId}`);

        // PASO 1: scraping de comentarios con Apify
        const rawItems = await runApifyActor(
            'streamers~youtube-comments-scraper',
            { startUrls: [{ url: canonicalUrl, method: 'GET' }], maxComments: 40 },
            getApifyKey()
        );

        // streamers~youtube-comments-scraper devuelve: comment, author, voteCount, publishedTimeText
        if (rawItems.length > 0) {
            console.log(`[YouTube] ${rawItems.length} raw items. Primer item:`, JSON.stringify(rawItems[0]).slice(0, 200));
        } else {
            console.warn('[YouTube] El actor devolvió 0 ítems');
        }

        const comments = rawItems
            .filter(item => {
                const t = item.comment || item.text || item.commentText || '';
                return t.trim().length > 3;
            })
            .map(item => ({
                text:     item.comment || item.text || item.commentText || '',
                author:   (item.author || 'Usuario').replace('@', ''),
                followers: 0,
                likes:    item.voteCount || item.likeCount || item.likes || 0,
                date:     item.publishedTimeText || item.publishedAt || new Date().toISOString().split('T')[0],
                platform: 'youtube',
            }));


        if (comments.length === 0) throw new Error('No se encontraron comentarios en este video.');
        console.log(`[YouTube] ${comments.length} comentarios a analizar`);

        // PASO 2: análisis con Gemini — máximo 40 comentarios para no superar timeout
        const insights = await processor.analyzeSentimentAndTrends(
            comments.slice(0, 40), `YouTube-${videoId}`, 'youtube'
        );

        // Guardar en Firestore
        const scanData = {
            brand: `YouTube-${videoId}`, platform: 'youtube',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            commentsCount: comments.length,
            raw_comments: comments,
            videoUrl: canonicalUrl,
            ...insights
        };
        await admin.firestore().collection('despegar_scans').doc(`youtube-${videoId}`).set(scanData);

        res.json({
            status: 'success',
            videoId,
            commentsCount: comments.length,
            sentiment: insights.sentiment,
            summary: insights.summary,
            topTopics: insights.topTopics,
            comments: comments.slice(0, 20),
        });
    } catch (e) {
        console.error('[YouTube Route Error]', e.message);
        res.status(500).json({ error: e.message });
    }
});


registerRoute('post', '/api/scout', async (req, res) => {
    const { url, platform, brand } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requerida' });

    const actorConfig = {
        tiktok:        { id: 'clockworks~tiktok-comments-scraper',       input: { postURLs: [url], commentsPerPost: 25, maxRepliesPerComment: 0 } },
        instagram:     { id: 'jaroslavsemanko~instagram-comment-scraper', input: { directUrls: [url], resultsLimit: 25 } },
        'google-maps': { id: 'compass~google-maps-reviews-scraper',       input: { queries: [url], maxReviews: 25 } },
        facebook:      { id: 'apify~facebook-comments-scraper',           input: { postUrls: [url], maxComments: 25 } },
    };
    const config = actorConfig[platform];
    if (!config) return res.status(400).json({ error: `Plataforma no soportada: ${platform}` });

    try {
        console.log(`[ScoutBot] Scraping ${platform}: ${url}`);

        // PASO 1: Apify — espera a que el actor termine (runApifyActor es síncrono)
        const rawItems = await runApifyActor(config.id, config.input, getApifyKey());
        const comments = normalizeApifyItems(rawItems).map(c => ({ ...c, platform }));

        if (comments.length === 0) {
            return res.json({
                status: 'done', comments: 0, comments_raw: [],
                summary: 'No se encontraron comentarios para analizar.',
                sentiment: { positive: 0, negative: 0, neutral: 100 }
            });
        }
        console.log(`[ScoutBot] ${comments.length} comentarios → Gemini`);

        // PASO 2: Gemini
        const insights = await processor.analyzeSentimentAndTrends(
            comments.slice(0, 30), brand || platform, platform
        );

        // Guardar en Firestore
        const docId = `scout-${platform}-${Date.now()}`;
        await admin.firestore().collection('despegar_scans').doc(docId).set({
            brand: brand || url, platform,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            commentsCount: comments.length,
            raw_comments: comments,
            source: 'scout',
            ...insights
        });

        res.json({ status: 'done', comments: comments.length, comments_raw: comments, ...insights });
    } catch (error) {
        console.error('[ScoutBot Error]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint legacy de insights (solo para mock data)
registerRoute('get', '/api/insights/:datasetId', async (req, res) => {
    const { datasetId } = req.params;
    try {
        const comments = [
            { text: 'Despegar me salvó las vacaciones, super fácil reservar!', author: 'viajero_ar', followers: 1200, likes: 45 },
            { text: 'El precio que encontré en Despegar fue el más bajo de todos.', author: 'travel_hunter', followers: 500, likes: 12 },
            { text: 'La app de Despegar es muy intuitiva, reservé en 2 minutos.', author: 'tech_traveler', followers: 800, likes: 30 },
        ];
        const insights = await processor.analyzeSentimentAndTrends(comments.slice(0, 30), datasetId, 'social');
        res.json({ comments: comments.length, comments_raw: comments, ...insights });
    } catch (error) {
        console.error('[Insights Error]', error.message);
        res.status(500).json({ error: error.message });
    }
});

registerRoute('get', '/api/history', async (req, res) => {
    try {
        const snapshot = await admin.firestore().collection('despegar_scans')
            .orderBy('timestamp', 'desc')
            .limit(10)
            .get();

        const history = [];
        snapshot.forEach(doc => history.push(doc.data()));
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin route to trigger full scouting manually
registerRoute('post', '/api/admin/scout-all', async (req, res) => {
    try {
        const { selectedKeys } = req.body || {};
        console.log("[Admin] Manual scout triggered. selectedKeys:", selectedKeys || 'ALL');

        // ─── Lista maestra de todas las cuentas posibles ─────────────────────
        // IMPORTANTE: las keys "brand:platform" deben coincidir con el frontend (SettingsView.jsx)
        const ALL_TARGETS = [
            // ── Owned ───────────────────────────────────────────────────────────
            { brand: 'Despegar',     platform: 'instagram', url: 'https://www.instagram.com/despegar/',      type: 'owned' },
            { brand: 'Despegar AR',  platform: 'instagram', url: 'https://www.instagram.com/despegar.ar/',   type: 'owned' },
            { brand: 'Despegar',     platform: 'tiktok',    url: 'https://www.tiktok.com/@despegar',         type: 'owned' },
            // ── Competitors ──────────────────────────────────────────────────────
            { brand: 'Turismo City', platform: 'instagram', url: 'https://www.instagram.com/turismocity_ar/', type: 'competitor' },
            { brand: 'Booking',      platform: 'instagram', url: 'https://www.instagram.com/bookingcom/',    type: 'competitor' },
            { brand: 'Airbnb',       platform: 'instagram', url: 'https://www.instagram.com/airbnb/',        type: 'competitor' },
            { brand: 'Turismo City', platform: 'tiktok',    url: 'https://www.tiktok.com/@turismocity',      type: 'competitor' },
            { brand: 'Booking',      platform: 'tiktok',    url: 'https://www.tiktok.com/@bookingcom',       type: 'competitor' },
            { brand: 'Airbnb',       platform: 'tiktok',    url: 'https://www.tiktok.com/@airbnb',           type: 'competitor' },
        ];

        // Filtrar según selección del frontend, o usar todos si no se especifica
        const targets = Array.isArray(selectedKeys) && selectedKeys.length > 0
            ? ALL_TARGETS.filter(t => selectedKeys.includes(`${t.brand}:${t.platform}`))
            : ALL_TARGETS;

        if (targets.length === 0) {
            return res.status(400).json({ error: 'No hay targets seleccionados.' });
        }

        console.log(`[Admin] Escaneando ${targets.length} cuenta(s):`, targets.map(t => `${t.brand}@${t.platform}`).join(', '));

        const db = admin.firestore();
        const p = new InsightProcessor();
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];


        // Inicializar estado de progreso en Firestore
        await db.collection('despegar_meta').doc('scoutStatus').set({
            status: 'running',
            startedAt: admin.firestore.FieldValue.serverTimestamp(),
            total: targets.length,
            completed: 0,
            failed: 0,
            currentBrand: targets[0].brand,
            currentPlatform: targets[0].platform,
            items: targets.map(t => ({ brand: t.brand, platform: t.platform, status: 'pending', commentsCount: 0 })),
            finishedAt: null
        });

        performScouting(targets, db, p, yesterday).catch(err => {
            console.error("[scout-all async error]", err);
            db.collection('despegar_meta').doc('scoutStatus').update({ status: 'error', error: err.message });
        });

        res.json({ status: "initiated", message: `Iniciando escaneo de ${targets.length} perfiles en segundo plano.`, total: targets.length });
    } catch (e) {
        if (e.message.includes("Cloud Firestore API has not been used")) {
            return res.status(500).json({ error: "Firestore deshabilitado.", instruction: "Habilite Firestore para activar el escaneo estratégico." });
        }
        res.status(500).json({ error: e.message });
    }
});

// Consultar estado del escaneo masivo en curso
registerRoute('get', '/api/admin/scout-status', async (req, res) => {
    try {
        const doc = await admin.firestore().collection('despegar_meta').doc('scoutStatus').get();
        if (!doc.exists) return res.json({ status: 'idle' });
        const data = doc.data();
        // Convertir Timestamps de Firestore a ISO strings
        res.json({
            ...data,
            startedAt: data.startedAt?.toDate?.()?.toISOString() || null,
            finishedAt: data.finishedAt?.toDate?.()?.toISOString() || null,
        });
    } catch (e) {
        res.json({ status: 'idle' });
    }
});

// Cold Start: Seed 7 days of historical data
registerRoute('post', '/api/admin/seed-history', async (req, res) => {
    try {
        console.log("[Admin] Seeding 7-day history for all brands...");
        const brands = [
            'Despegar', 'Despegar AR',
            'Turismo City', 'Booking', 'Airbnb'
        ];

        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;
        const db = admin.firestore();

        for (let i = 0; i < 7; i++) {
            const targetDate = new Date(now - i * dayMs);
            const dateStr = targetDate.toISOString().split('T')[0];

            for (const brand of brands) {
                const isOwned = ['Despegar', 'Despegar AR'].includes(brand);
                const basePos = isOwned ? 65 : 55;
                const variance = Math.random() * 15;

                const sentiment = {
                    positive: Math.round(basePos + variance),
                    neutral: Math.round(20 + Math.random() * 10),
                    negative: 0
                };
                sentiment.negative = 100 - sentiment.positive - sentiment.neutral;

                const summary = {
                    brand,
                    date: dateStr,
                    sentiment,
                    volume: Math.round(150 + Math.random() * 200),
                    top_themes: isOwned ? ['Calidad', 'Servicio', 'Promociones'] : ['Competencia', 'Precios', 'Nuevos Productos'],
                    brief: `Análisis histórico generado para ${brand}. Fecha: ${dateStr}.`,
                    alerts: sentiment.negative > 20 ? [`Alerta de sentimiento en ${brand}`] : []
                };

                await db.collection('despegar_scans').add({
                    brand,
                    platform: 'aggregate',
                    summary,
                    timestamp: admin.firestore.Timestamp.fromDate(targetDate),
                    isHistoricalSeed: true
                });
            }
        }
        res.json({ success: true, message: "Historial de 7 días generado correctamente." });
    } catch (e) {
        if (e.message.includes("Cloud Firestore API has not been used")) {
            return res.status(500).json({ error: "Firestore deshabilitado.", instruction: "Debe activar Firestore en la consola de Firebase." });
        }
        res.status(500).json({ error: e.message });
    }
});

// Admin Route to get the status of all brands (last updated, data volume)
registerRoute('get', '/api/admin/brands-status', async (req, res) => {
    try {
        const db = admin.firestore();
        const scansRef = db.collection('despegar_scans');
        const snapshot = await scansRef.get();

        const statusMap = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            const brand = data.brand;
            const ts = data.timestamp ? data.timestamp.toDate() : null;

            if (!brand) return;

            if (!statusMap[brand]) {
                statusMap[brand] = { count: 0, lastUpdated: ts };
            }

            statusMap[brand].count += 1;

            if (ts && (!statusMap[brand].lastUpdated || ts > statusMap[brand].lastUpdated)) {
                statusMap[brand].lastUpdated = ts;
            }
        });

        res.json(statusMap);
    } catch (error) {
        console.error("[Brands Status Error]", error);
        if (error.message.includes("Cloud Firestore API has not been used")) {
            return res.status(500).json({
                error: "Firestore is not enabled in this project.",
                instruction: "Por favor, activa Firestore en el Firebase Console (Build > Firestore Database) para habilitar el rastreo real."
            });
        }
        res.status(500).json({ error: error.message });
    }
});

// Mock de data de Cuántico (Insights de marcas propias)
registerRoute('get', '/api/cuantico/summary', async (req, res) => {
    try {
        const db = admin.firestore();
        const brands = ['Despegar', 'Despegar AR'];
        const summaries = [];

        for (const brand of brands) {
            let query = db.collection('despegar_scans')
                .where('brand', '==', brand)
                .orderBy('timestamp', 'desc')
                .limit(1);

            let snapshot;
            try {
                snapshot = await query.get();
            } catch (e) {
                // Si falla por índice compuesto, fallback sin orderBy
                const fallback = await db.collection('despegar_scans').where('brand', '==', brand).get();
                const docs = fallback.docs.sort((a, b) => (b.data().timestamp?.seconds || 0) - (a.data().timestamp?.seconds || 0));
                snapshot = { empty: docs.length === 0, docs };
            }

            if (!snapshot.empty) {
                const data = snapshot.docs[0].data();
                summaries.push({
                    brand: data.brand,
                    sentiment: data.sentiment?.positive > 70 ? 'Favorable' : (data.sentiment?.negative > 30 ? 'Crítico' : 'Neutral'),
                    text: data.summary || "Sin resumen disponible",
                    date: 'Último Scan',
                    pos: data.sentiment?.positive || 0,
                    neu: data.sentiment?.neutral || 0,
                    neg: data.sentiment?.negative || 0
                });
            } else {
                summaries.push({
                    brand,
                    sentiment: 'Pendiente',
                    text: 'Esperando primer escaneo programado...',
                    date: 'N/A',
                    pos: 0, neu: 0, neg: 0
                });
            }
        }
        res.json(summaries);
    } catch (error) {
        // Devolver array vacío en lugar de objeto de error para no romper .map() en el frontend
        console.error('[Cuantico Error]', error.message);
        res.json([]);
    }
});

// Alertas activas (tomadas de los últimos scans)
registerRoute('get', '/api/alerts', async (req, res) => {
    try {
        const db = admin.firestore();
        const snapshot = await db.collection('despegar_scans')
            .orderBy('timestamp', 'desc')
            .limit(20)
            .get();

        const alerts = [];
        snapshot.forEach(doc => {
            const d = doc.data();
            (d.alerts || []).forEach(a => alerts.push(typeof a === 'string' ? { message: a, brand: d.brand } : { ...a, brand: d.brand }));
        });

        res.json(alerts.slice(0, 10));
    } catch (e) {
        console.error('[Alerts Error]', e.message);
        res.json([]);
    }
});

// Reporte semanal más reciente
registerRoute('get', '/api/reports', async (req, res) => {
    try {
        const db = admin.firestore();
        const snapshot = await db.collection('despegar_reports')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();

        if (!snapshot.empty) {
            return res.json(snapshot.docs[0].data());
        }
        res.json(null);
    } catch (e) {
        console.error('[Reports Error]', e.message);
        res.json(null);
    }
});

// Serie histórica de sentimiento por marca/plataforma
registerRoute('get', '/api/historical', async (req, res) => {
    try {
        const { brand, platform } = req.query;
        const db = admin.firestore();
        let query = db.collection('despegar_scans').orderBy('timestamp', 'desc').limit(30);
        let snapshot;
        try {
            if (brand) {
                // where + orderBy requiere índice compuesto — hacemos where primero
                const rawSnap = await db.collection('despegar_scans')
                    .where('brand', '==', brand)
                    .orderBy('timestamp', 'desc')
                    .limit(30)
                    .get();
                snapshot = rawSnap;
            } else {
                snapshot = await query.get();
            }
        } catch (e) {
            // Fallback: traer todo y filtrar en memoria
            console.warn('[Historical] Index missing, filtering in memory:', e.message);
            const all = await db.collection('despegar_scans').orderBy('timestamp', 'desc').limit(50).get();
            const docs = brand ? all.docs.filter(d => d.data().brand === brand) : all.docs;
            snapshot = { docs };
        }
        const rows = [];
        snapshot.forEach(doc => {
            const d = doc.data();
            rows.push({
                brand: d.brand,
                platform: d.platform,
                date: d.timestamp?.toDate?.()?.toISOString() || null,
                positive: d.sentiment?.positive || 0,
                negative: d.sentiment?.negative || 0,
                neutral: d.sentiment?.neutral || 0,
                commentsCount: d.commentsCount || 0,
            });
        });
        res.json(rows);
    } catch (e) {
        console.error('[Historical Error]', e.message);
        res.json([]);
    }
});

// Admin Route to seed 7 days of Bembos Data
registerRoute('get', '/api/admin/seed-bembos', async (req, res) => {
    try {
        console.log("[Admin] Iniciando seeding de Bembos...");
        const db = admin.firestore();
        const batch = db.batch();
        const now = new Date();
        const brand = "Bembos";

        for (let i = 0; i < 7; i++) {
            const date = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
            const scanId = `seed-bembos-${i}-${Date.now()}`;

            const sentiment = {
                positive: 70 + Math.floor(Math.random() * 25),
                negative: Math.floor(Math.random() * 15),
                neutral: 5 + Math.floor(Math.random() * 10)
            };

            const data = {
                brand: brand,
                platform: i % 2 === 0 ? 'tiktok' : 'instagram',
                timestamp: admin.firestore.Timestamp.fromDate(date),
                sentiment: sentiment,
                summary: `Resumen estratégico del día ${i === 0 ? 'hoy' : i + ' días atrás'}. El volumen de menciones se mantiene estable.`,
                commentsCount: 25 + Math.floor(Math.random() * 60),
                topTopics: ["Sabor unico", "Pueblo Libre", "Salsas"],
                raw_comments: [
                    { author: 'lucho_burger', text: 'La carretillera nunca falla', followers: 850 },
                    { author: 'lima_eats', text: 'Bembos es bife', followers: 25000 }
                ]
            };

            const scanRef = db.collection('despegar_scans').doc(scanId);
            batch.set(scanRef, data);
        }

        await batch.commit();
        res.json({ status: "success", message: "Historial generado para Bembos." });
    } catch (e) {
        console.error("[Admin Seed Error]", e);
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

// ─── Endpoint: uso real de cuota de Apify ────────────────────────────────────
registerRoute('get', '/api/admin/apify-usage', async (req, res) => {
    try {
        const { data } = await axios.get(
            `https://api.apify.com/v2/users/me?token=${getApifyKey()}`
        );
        const user = data.data;
        const plan = user.plan || {};
        const usage = user.monthlyUsage || {};
        res.json({
            username:          user.username,
            planName:          plan.id || plan.name || 'Free',
            limitUsd:          plan.monthlyUsageCreditsUsdLimit || 5,
            usedAcu:           usage.ACTOR_COMPUTE_UNITS || 0,
            usedUsd:           plan.currentPeriodUsageUsd || (usage.ACTOR_COMPUTE_UNITS || 0) * 0.4,
            nextResetDate:     plan.currentPeriodEndDate || null,
        });
    } catch (e) {
        console.error('[ApifyUsage]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ─── Endpoint: disparar fetch de trends desde la app ─────────────────────────
// Keywords viaje relacionadas a Despegar — scan liviano (max 20 posts/keyword)
const TREND_KEYWORDS = ['viajes', 'travel', 'despegar', 'vuelos', 'vacaciones'];

registerRoute('post', '/api/trends/run', async (req, res) => {
    const apifyKey = getApifyKey();
    if (!apifyKey) return res.status(500).json({ error: 'APIFY_API_KEY no configurada' });

    const {
        platform  = 'tiktok',     // 'tiktok' | 'instagram'
        keywords  = TREND_KEYWORDS,
        maxItems  = 20,            // posts por keyword — mantener bajo para ahorrar cuota
    } = req.body;

    try {
        console.log(`[Trends/Run] Iniciando scan ${platform} — keywords: ${keywords.join(', ')}`);

        // Actor según plataforma
        // TikTok:    clockworks/tiktok-scraper   (búsqueda por hashtag)
        // Instagram: apify/instagram-hashtag-scraper
        const actorId = platform === 'instagram'
            ? 'apify~instagram-hashtag-scraper'
            : 'clockworks~tiktok-scraper';

        // Input del actor según plataforma
        const actorInput = platform === 'instagram'
            ? {
                hashtags: keywords,
                resultsLimit: maxItems,
                resultsType: 'posts',
              }
            : {
                hashtags:    keywords,       // TikTok scraper acepta hashtags directamente
                maxItems,
                searchSection: 'hashtag',
                shouldDownloadVideos: false, // no descargar videos — solo metadata
                shouldDownloadCovers: false,
              };

        // 1. Lanzar run en Apify (síncrono con ?waitForFinish=120)
        const runRes = await axios.post(
            `https://api.apify.com/v2/acts/${actorId}/runs?token=${apifyKey}&waitForFinish=120`,
            actorInput,
            { timeout: 130000 }  // 130s
        );

        const { id: runId, status, defaultDatasetId } = runRes.data?.data || {};
        console.log(`[Trends/Run] Apify run ${runId} — status: ${status}`);

        if (status !== 'SUCCEEDED') {
            return res.status(500).json({ error: `Apify run terminó con status: ${status}`, runId });
        }

        // 2. Fetch dataset
        const dataRes = await axios.get(
            `https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${apifyKey}&limit=500`,
            { timeout: 30000 }
        );
        const items = dataRes.data || [];
        console.log(`[Trends/Run] ${items.length} items obtenidos del dataset`);

        // 3. Normalizar items → trends
        const db = admin.firestore();
        const batch = db.batch();
        let count = 0;

        // Agrupar por hashtag para calcular métricas agregadas
        const hashtagMap = {};

        items.forEach(item => {
            // Extraer hashtags del item
            const rawTags = platform === 'instagram'
                ? (item.hashtags || [])
                : (item.hashtags || item.challengeInfoList || []);

            const videoViews  = item.playCount  || item.videoPlayCount || item.viewsCount || 0;
            const videoLikes  = item.diggCount   || item.likesCount    || item.likes      || 0;
            const videoComments = item.commentCount || item.comments     || 0;
            const videoShares   = item.shareCount   || item.shares       || 0;

            rawTags.forEach(tag => {
                const tagName = typeof tag === 'string' ? tag
                    : (tag.hashtagName || tag.name || tag.challengeName || '');
                if (!tagName) return;
                const key = tagName.toLowerCase().replace(/^#/, '');

                if (!hashtagMap[key]) {
                    hashtagMap[key] = {
                        title:    `#${key}`,
                        subtitle: `${platform === 'tiktok' ? 'TikTok' : 'Instagram'} · Trend`,
                        platform,
                        type:     'hashtag',
                        views:    0, likes: 0, comments: 0, shares: 0,
                        posts_count: 0,
                        keywords: [],
                        top_accounts: [],
                        description: `Hashtag trending relacionado a viajes y turismo.`,
                        growth_pct: Math.floor(Math.random() * 40) + 5, // TODO: calcular real
                        source:   'apify',
                    };
                }

                hashtagMap[key].views       += videoViews;
                hashtagMap[key].likes       += videoLikes;
                hashtagMap[key].comments    += videoComments;
                hashtagMap[key].shares      += videoShares;
                hashtagMap[key].posts_count += 1;

                // Capturar top accounts
                const author = item.authorMeta?.name || item.author?.uniqueId || item.ownerUsername || '';
                if (author && !hashtagMap[key].top_accounts.includes(`@${author}`)) {
                    hashtagMap[key].top_accounts.push(`@${author}`);
                }
            });
        });

        // Guardar top hashtags en Firestore
        const topTrends = Object.entries(hashtagMap)
            .filter(([, t]) => t.posts_count >= 2)  // al menos 2 posts con ese hashtag
            .sort(([, a], [, b]) => b.views - a.views)
            .slice(0, 30);

        topTrends.forEach(([key, trend]) => {
            trend.top_accounts = [...new Set(trend.top_accounts)].slice(0, 5);
            const docId = `${trend.platform}-hashtag-${key.slice(0, 40)}`;
            batch.set(db.collection('despegar_trends').doc(docId), {
                ...trend,
                scraped_at: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            count++;
        });

        await batch.commit();
        console.log(`[Trends/Run] ${count} trends guardados en Firestore`);

        res.json({
            ok: true,
            platform,
            keywords_scanned: keywords,
            items_fetched:    items.length,
            trends_saved:     count,
            runId,
        });

    } catch (err) {
        console.error('[Trends/Run]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── Endpoint: trends de TikTok/Instagram (populado por Apify) ────────────────
// Colección: despegar_trends — cada doc es un trend/hashtag scraped por Apify
// Keywords configuradas: travel, viajes, despegar, vuelos, hotel, vacaciones, turismo
registerRoute('get', '/api/trends', async (req, res) => {
    try {
        const { platform, type, limit = 50 } = req.query;

        let query = admin.firestore().collection('despegar_trends')
            .orderBy('views', 'desc')
            .limit(parseInt(limit));

        const snap = await query.get();
        let trends = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Filtrar en memoria (evita índices compuestos)
        if (platform) trends = trends.filter(t => t.platform === platform);
        if (type)     trends = trends.filter(t => t.type     === type);

        // Devuelve array vacío si no hay datos — el frontend usa mock en ese caso
        res.json(trends);
    } catch (e) {
        console.error('[Trends]', e.message);
        // 200 con array vacío para que el frontend use mock sin mostrar error
        res.json([]);
    }
});

// ─── Endpoint (webhook): recibir trends de Apify webhook ─────────────────────
// Apify → Webhook → POST /api/trends/ingest
// Configurar en Apify: Dataset > Webhooks > URL = https://<backend>/api/trends/ingest
registerRoute('post', '/api/trends/ingest', async (req, res) => {
    try {
        const items = Array.isArray(req.body) ? req.body : (req.body?.items || []);
        if (!items.length) return res.json({ ok: true, inserted: 0 });

        const db = admin.firestore();
        const batch = db.batch();
        let count = 0;

        items.forEach(item => {
            // Normalizar campos según actor Apify
            const doc = {
                platform:    item.platform || (item.tiktokUrl ? 'tiktok' : 'instagram'),
                type:        item.type || (item.hashtagName ? 'hashtag' : item.audioName ? 'audio' : 'hashtag'),
                title:       item.hashtagName || item.audioName || item.name || item.title || '',
                subtitle:    item.description || item.subtitle || '',
                views:       item.viewCount   || item.views   || 0,
                likes:       item.likesCount  || item.likes   || 0,
                comments:    item.commentsCount || item.comments || 0,
                shares:      item.sharesCount || item.shares  || 0,
                posts_count: item.postsCount  || item.posts_count || 0,
                growth_pct:  item.growthPct   || item.growth_pct || 0,
                keywords:    item.keywords    || [],
                top_accounts: item.topAccounts || [],
                thumbnail:   item.thumbnailUrl || item.thumbnail || null,
                description: item.description || '',
                source:      'apify',
                scraped_at:  admin.firestore.FieldValue.serverTimestamp(),
            };

            // ID estable: platform-type-title (evita duplicados del mismo scraping)
            const docId = `${doc.platform}-${doc.type}-${doc.title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}`;
            batch.set(db.collection('despegar_trends').doc(docId), doc, { merge: true });
            count++;
        });

        await batch.commit();
        console.log(`[Trends] Ingested ${count} trends from Apify`);
        res.json({ ok: true, inserted: count });
    } catch (e) {
        console.error('[Trends ingest]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ─── Endpoint: comentarios analizados del scan más reciente de una cuenta ──────
registerRoute('get', '/api/scan-comments', async (req, res) => {
    try {
        const { brand, platform, date } = req.query;
        if (!brand || !platform) return res.status(400).json({ error: 'brand y platform son requeridos' });

        let snap;
        if (date) {
            // Buscar scan del día específico
            const docId = `${brand}-${platform}-${date}`;
            const doc = await admin.firestore().collection('despegar_scans').doc(docId).get();
            snap = doc.exists ? [doc] : [];
        } else {
            // Buscar el scan más reciente
            const q = await admin.firestore().collection('despegar_scans')
                .where('brand',    '==', brand)
                .where('platform', '==', platform)
                .orderBy('timestamp', 'desc')
                .limit(1)
                .get();
            snap = q.docs;
        }

        if (!snap.length) return res.json([]);

        const scanData = snap[0].data ? snap[0].data() : snap[0].data;
        const comments = scanData.comments_analyzed || [];
        res.json(comments);
    } catch (e) {
        console.error('[ScanComments]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ─── Endpoint: posts rankeados por sentimiento ────────────────────────────────

registerRoute('get', '/api/posts', async (req, res) => {
    try {
        const { brand, platform, sort = 'best', limit = 50 } = req.query;

        // Traer todos y filtrar en memoria para evitar índice compuesto brand+sentimentScore
        let query = admin.firestore().collection('despegar_posts');
        const snap = await query.limit(300).get();
        let posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Filtros en memoria
        if (brand)    posts = posts.filter(p => p.brand    === brand);
        if (platform) posts = posts.filter(p => p.platform === platform);

        // Ordenar
        posts.sort((a, b) => sort === 'worst'
            ? (a.sentimentScore || 0) - (b.sentimentScore || 0)
            : (b.sentimentScore || 0) - (a.sentimentScore || 0));

        posts = posts.slice(0, parseInt(limit));

        // Enriquecer con comments_analyzed del scan más reciente de ese post
        // Buscamos por postId o por (brand + platform) ordenado por timestamp
        const enriched = await Promise.all(posts.map(async (post) => {
            try {
                let scanSnap;
                if (post.scanId) {
                    // Si el post tiene referencia directa al scan
                    const scanDoc = await admin.firestore().collection('despegar_scans').doc(post.scanId).get();
                    if (scanDoc.exists) scanSnap = [scanDoc];
                }
                if (!scanSnap) {
                    // Buscar el scan más reciente del mismo brand+platform
                    const q = await admin.firestore().collection('despegar_scans')
                        .where('brand',    '==', post.brand)
                        .where('platform', '==', post.platform)
                        .orderBy('timestamp', 'desc')
                        .limit(1)
                        .get();
                    scanSnap = q.docs;
                }
                if (scanSnap && scanSnap.length > 0) {
                    const scanData = (scanSnap[0].data ? scanSnap[0].data() : scanSnap[0].data);
                    // Filtrar comentarios que corresponden a este post (por postId o por url)
                    const allComments = scanData.comments_analyzed || [];
                    const postComments = post.postId
                        ? allComments.filter(c => c.postId === post.postId || c.post_url === post.url)
                        : allComments.slice(0, 20); // si no hay postId, incluir los primeros del scan
                    return { ...post, comments_analyzed: postComments };
                }
            } catch (err) {
                console.warn('[Posts] Error enriching post', post.id, err.message);
            }
            return post;
        }));

        res.json(enriched);
    } catch (e) {
        console.error('[Posts]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Final handler for 404s

app.use((req, res) => {
    console.warn(`[404] No route found for ${req.method} ${req.path}`);
    res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});


// Cloud Run: arrancar directamente si es el módulo principal
if (require.main === module) {
    const PORT = process.env.PORT || 8080;
    app.listen(PORT, () => {
        console.log(`[Backend] Servidor Cloud Run corriendo en puerto ${PORT}`);
    });
}

// Exportar app para uso en server.js o tests
module.exports = { app };

exports.apiServer = onRequest({
    region: 'us-central1',
    cors: true,
    maxInstances: 10,
    timeoutSeconds: 300,
    memory: '1GiB',
}, app);

// Tareas Programadas - Daily Automation
exports.dailyScouting = onSchedule({
    schedule: 'every day 01:00',
    timeZone: 'America/Argentina/Buenos_Aires',
    memory: '1GiB',
    timeoutSeconds: 540
}, async (event) => {
    console.log("[DailyScout] Iniciando escaneo estratégico de Despegar Portfolio...");

    const db = admin.firestore();
    const processor = new InsightProcessor();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const targets = [
        // Owned
        { brand: 'Despegar',     platform: 'instagram', url: 'https://www.instagram.com/despegar/',       type: 'owned' },
        { brand: 'Despegar AR',  platform: 'instagram', url: 'https://www.instagram.com/despegar.ar/',    type: 'owned' },
        { brand: 'Despegar',     platform: 'tiktok',    url: 'https://www.tiktok.com/@despegar',          type: 'owned' },
        // Competitors
        { brand: 'Turismo City', platform: 'instagram', url: 'https://www.instagram.com/turismocity_ar/', type: 'competitor' },
        { brand: 'Booking',      platform: 'instagram', url: 'https://www.instagram.com/bookingcom/',     type: 'competitor' },
        { brand: 'Airbnb',       platform: 'instagram', url: 'https://www.instagram.com/airbnb/',         type: 'competitor' },
        { brand: 'Turismo City', platform: 'tiktok',    url: 'https://www.tiktok.com/@turismocity',       type: 'competitor' },
        { brand: 'Booking',      platform: 'tiktok',    url: 'https://www.tiktok.com/@bookingcom',        type: 'competitor' },
        { brand: 'Airbnb',       platform: 'tiktok',    url: 'https://www.tiktok.com/@airbnb',            type: 'competitor' },
    ];

    await performScouting(targets, db, processor, yesterday);

    // 4. Update Weekly Report
    const scans = await db.collection('despegar_scans').where('timestamp', '>', admin.firestore.Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))).get();
    const summaries = scans.docs.map(doc => doc.data().summary);
    const weeklyBrief = await processor.generateWeeklyExecutiveBriefing(summaries);
    if (weeklyBrief) {
        await db.collection('despegar_reports').add({ ...weeklyBrief, timestamp: admin.firestore.FieldValue.serverTimestamp() });
    }
});

async function performScouting(targets, db, processor, yesterday) {
    const statusRef = db.collection('despegar_meta').doc('scoutStatus');
    let completed = 0;
    let failed = 0;

    for (let idx = 0; idx < targets.length; idx++) {
        const target = targets[idx];
        try {
            console.log(`[Scouting] (${idx + 1}/${targets.length}) ${target.brand} @ ${target.platform}`);

            // Actualizar estado: procesando esta marca
            await statusRef.update({
                currentBrand: target.brand,
                currentPlatform: target.platform,
                [`items.${idx}.status`]: 'scraping',
            }).catch(() => {});

            // ── Scraping en 2 pasos según plataforma ───────────────────
            const apifyKey = getApifyKey();
            let rawData = [];
            let videoMeta = [];

            if (target.platform === 'tiktok') {
                const result = await scrapeTikTokComments(target.url, apifyKey, 10);
                rawData   = result.comments;
                videoMeta = result.videoMeta;
            } else if (target.platform === 'instagram') {
                const result = await scrapeInstagramComments(target.url, apifyKey, 10);
                rawData   = result.comments;
                videoMeta = result.videoMeta;
            }

            // Actualizar: analizando con Gemini
            await statusRef.update({ [`items.${idx}.status`]: 'gemini' }).catch(() => {});

            const rawComments = normalizeApifyItems(rawData).map((c, i) => ({
                ...c, platform: target.platform, brand: target.brand, date: yesterday,
                sourceVideoUrl: rawData[i]?.sourceVideoUrl || '',
            }));



            if (rawComments.length > 0) {
                // Actualizar: procesando con Gemini
                await statusRef.update({ [`items.${idx}.status`]: 'gemini' }).catch(() => {});

                const insights = await processor.analyzeSentimentAndTrends(rawComments, target.brand, target.platform);

                const scanData = {
                    brand: target.brand, platform: target.platform,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    commentsCount: rawComments.length,
                    raw_comments: rawComments,
                    ...insights
                };

                await db.collection('despegar_scans').doc(`${target.brand}-${target.platform}-${yesterday}`).set(scanData);

                // ── Guardar metadata por video/post en colección posts ──────────────────
                if (videoMeta.length > 0) {
                    const positivePct = insights.sentiment?.positive || 0;
                    const negativePct = insights.sentiment?.negative || 0;
                    const neutralPct  = insights.sentiment?.neutral  || 0;
                    const batch = db.batch();
                    videoMeta.forEach((vm, vi) => {
                        const docId = `${target.brand}-${target.platform}-${yesterday}-post${vi}`;
                        batch.set(db.collection('despegar_posts').doc(docId), {
                            brand:        target.brand,
                            platform:     target.platform,
                            date:         yesterday,
                            url:          vm.url,
                            thumbnailUrl: vm.thumbnailUrl,
                            description:  vm.description,
                            likes:        vm.likes,
                            views:        vm.views,
                            commentCount: vm.commentCount,
                            // sentiment del scan completo (aproximación por video)
                            sentiment: { positive: positivePct, negative: negativePct, neutral: neutralPct },
                            sentimentScore: positivePct - negativePct, // [-100, 100]
                            timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        });
                    });
                    await batch.commit();
                    console.log(`[Posts] ${videoMeta.length} posts guardados para ${target.brand}`);
                }

                if (insights.sentiment?.negative > 30) {
                    await processor.sendSlackNotification(
                        `CRISIS ALERT: ${target.brand}`,
                        `Detectado ${insights.sentiment.negative}% sentimiento negativo.`,
                        '#FF53BA'
                    );
                }

                completed++;
                await statusRef.update({
                    completed,
                    [`items.${idx}.status`]: 'done',
                    [`items.${idx}.commentsCount`]: rawComments.length,
                    [`items.${idx}.sentiment`]: insights.sentiment?.positive || 0,
                }).catch(() => {});
            } else {
                completed++;
                await statusRef.update({
                    completed,
                    [`items.${idx}.status`]: 'done',
                    [`items.${idx}.commentsCount`]: 0,
                }).catch(() => {});
            }
        } catch (err) {
            failed++;
            console.error(`[Scouting Error] ${target.brand}:`, err.message);
            await statusRef.update({
                failed,
                [`items.${idx}.status`]: 'error',
                [`items.${idx}.error`]: err.message,
            }).catch(() => {});
        }
    }

    // Marcar como completado
    await statusRef.update({
        status: 'done',
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        currentBrand: null,
        currentPlatform: null,
    }).catch(() => {});

    console.log(`[Scouting] Completado: ${completed}/${targets.length} (${failed} errores)`);
}

exports.weeklyReport = onSchedule({
    schedule: 'every monday 08:00',
    timeZone: 'America/Argentina/Buenos_Aires',
    memory: '1GiB'
}, async (event) => {
    console.log("[WeeklyReport] Iniciando consolidación semanal...");
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const snapshot = await admin.firestore().collection('despegar_scans')
        .where('timestamp', '>', lastWeek)
        .limit(20)
        .get();

    const summaries = [];
    snapshot.forEach(doc => {
        const d = doc.data();
        summaries.push({ brand: d.brand, summary: d.summary, sentiment: d.sentiment });
    });

    if (summaries.length > 0) {
        const briefing = await processor.generateWeeklyExecutiveBriefing(summaries);
        if (briefing) {
            await admin.firestore().collection('despegar_reports').add({
                ...briefing,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                scanCount: summaries.length
            });
            console.log(`[WeeklyReport] Briefing semanal generado con éxito.`);
        }
    }
    return null;
});

registerRoute('get', '/api/reports', async (req, res) => {
    try {
        const snapshot = await admin.firestore().collection('despegar_reports').orderBy('timestamp', 'desc').limit(1).get();
        if (snapshot.empty) return res.json(null);
        res.json(snapshot.docs[0].data());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

registerRoute('get', '/api/alerts', async (req, res) => {
    try {
        const snapshot = await admin.firestore().collection('despegar_alerts').orderBy('timestamp', 'desc').limit(5).get();
        const logs = [];
        snapshot.forEach(doc => logs.push(doc.data()));
        res.json(logs);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

registerRoute('get', '/api/historical', async (req, res) => {
    try {
        const { brand, platform } = req.query;
        let query = admin.firestore().collection('despegar_scans').orderBy('timestamp', 'desc');

        if (brand) query = query.where('brand', '==', brand);
        if (platform) query = query.where('platform', '==', platform);

        const snapshot = await query.limit(20).get();
        let results = [];
        snapshot.forEach(doc => results.push(doc.data()));

        // MOCK DATA FALLBACK
        if (results.length === 0) {
            results = [
                {
                    brand: 'Bembos',
                    platform: 'tiktok',
                    sentiment: { positive: 88, negative: 5 },
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    raw_comments: [
                        { author: 'burger_king_fan', text: 'La Bembos es insuperable, amo la carretillera!', followers: 15400, platform: 'tiktok' },
                        { author: 'nico_vlog', text: 'El delivery llegó en 15 min, increíble.', followers: 2300, platform: 'tiktok' }
                    ]
                },
                {
                    brand: 'Papa Johns',
                    platform: 'instagram',
                    sentiment: { positive: 42, negative: 38 },
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    raw_comments: [
                        { author: 'pizza_hater', text: 'Me enviaron la pizza equivocada y nadie responde.', followers: 500, platform: 'instagram' }
                    ]
                }
            ];
        }

        res.json(results);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
