const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const InsightProcessor = require('./agents/processor');
const YoutubeProcessor = require('./agents/youtube_processor');

const { BigQuery } = require('@google-cloud/bigquery');
const { LanguageServiceClient } = require('@google-cloud/language');
const { google } = require('googleapis');

require('dotenv').config();

const bq = new BigQuery({ projectId: 'hike-agentic-playground' });
const languageClient = new LanguageServiceClient({ projectId: 'hike-agentic-playground' });
const youtube = google.youtube('v3');
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
// ─── TikTok: perfil o video → extracción metadata (Extractor) → comentarios (Scraper) ─────
async function scrapeTikTokComments(inputUrl, apifyKey, numVideos = 10) {
    const isVideo = inputUrl.includes('/video/') || inputUrl.includes('vm.tiktok.com');
    
    // PASO 1: Usar "Free TikTok Scraper" (Data Extractor) para obtener metadata y URLs de videos
    console.log(`[TikTok] Paso 1: Usando Data Extractor en ${inputUrl} (${isVideo ? 'Video' : 'Perfil'})`);
    
    const actorInput = isVideo 
        ? { postURLs: [inputUrl], shouldDownloadVideos: false, shouldDownloadCovers: false }
        : { profiles: [inputUrl], resultsPerPage: Math.max(numVideos * 3, 10), shouldDownloadVideos: false, shouldDownloadCovers: false };

    // PASO 1: Extracción de metadata de videos
    console.log(`[ScoutBot] TikTok Paso 1: Extrayendo información de videos de ${inputUrl}...`);
    const rawData = await runApifyActor('clockworks~free-tiktok-scraper', actorInput, apifyKey);

    // Normalizar metadata de videos/posts
    const allMeta = rawData.map(v => ({
        url:          v.webVideoUrl || v.url || v.videoUrl || '',
        thumbnailUrl: v.coverUrl || v.thumbnail || '',
        description:  (v.desc || v.text || '').slice(0, 200),
        platform:     'tiktok',
        likes:        v.stats?.diggCount || v.diggCount || 0,
        views:        v.stats?.playCount || v.playCount || 0,
        commentCount: v.stats?.commentCount || v.commentCount || 0,
    })).filter(v => v.url && v.url.includes('tiktok.com'));

    let videoMeta = [];
    if (isVideo) {
        videoMeta = allMeta.slice(0, 1);
    } else {
        // Ordenar por interacción para perfiles
        const sorted = [...allMeta].sort((a, b) => {
            const scoreA = (a.commentCount > 0 ? 100000 : 0) + a.commentCount * 10 + a.likes;
            const scoreB = (b.commentCount > 0 ? 100000 : 0) + b.commentCount * 10 + b.likes;
            return scoreB - scoreA;
        });
        videoMeta = sorted.filter(v => v.commentCount > 0).slice(0, numVideos);
        if (videoMeta.length === 0) videoMeta = sorted.slice(0, numVideos);
    }

    const videoUrls = videoMeta.map(v => v.url);
    if (videoUrls.length === 0) throw new Error('No se pudo extraer información del video o perfil TikTok. Revisa la URL.');

    console.log(`[TikTok] Paso 2: Extrayendo comentarios con Comment Scraper de ${videoUrls.length} posts`);
    // PASO 2: Extracción de comentarios de los videos seleccionados
    console.log(`[ScoutBot] TikTok Paso 2: Extrayendo comentarios de ${videoUrls.length} videos...`);
    const rawComments = await runApifyActor(
        'clockworks~tiktok-comments-scraper',
        { postURLs: videoUrls, commentsPerPost: 30, maxRepliesPerComment: 0 },
        apifyKey
    );

    // Tagear comentarios con su video de origen
    const comments = rawComments.map(c => ({
        ...c,
        sourceVideoUrl: c.postUrl || c.videoUrl || videoUrls[0] || '',
    }));

    console.log(`[TikTok] ${comments.length} comentarios obtenidos exitosamente.`);
    return { comments, videoMeta };
}

// ─── Instagram: perfil o post → extracción metadata (Scraper) → comentarios (Scraper) ──────
async function scrapeInstagramComments(inputUrl, apifyKey, numPosts = 10) {
    const isPost = inputUrl.includes('/p/') || inputUrl.includes('/reels/') || inputUrl.includes('/tv/');
    
    // PASO 1: Usar "Instagram Scraper" para obtener metadata y URLs
    console.log(`[Instagram] Paso 1: Usando Scraper en ${inputUrl} (${isPost ? 'Post' : 'Perfil'})`);
    
    const actorInput = isPost
        ? { directUrls: [inputUrl], resultsType: 'posts', resultsLimit: 1, addParentData: true }
        : { directUrls: [inputUrl], resultsType: 'posts', resultsLimit: Math.max(numPosts * 3, 10), addParentData: false };

    // PASO 1: Extracción de posts
    console.log(`[ScoutBot] Instagram Paso 1: Extrayendo posts de ${inputUrl}...`);
    const rawData = await runApifyActor('apify~instagram-scraper', actorInput, apifyKey);

    const allMeta = rawData.map(p => ({
        url:          p.url || p.directUrl || '',
        thumbnailUrl: p.displayUrl || p.thumbnail || '',
        description:  (p.caption || '').slice(0, 200),
        platform:     'instagram',
        likes:        p.likesCount || 0,
        views:        p.videoPlayCount || 0,
        commentCount: p.commentsCount || 0,
    })).filter(p => p.url && p.url.includes('instagram.com'));

    let videoMeta = [];
    if (isPost) {
        videoMeta = allMeta.slice(0, 1);
    } else {
        const sorted = [...allMeta].sort((a, b) => {
            const scoreA = (a.commentCount > 0 ? 100000 : 0) + a.commentCount * 10 + a.likes;
            const scoreB = (b.commentCount > 0 ? 100000 : 0) + b.commentCount * 10 + b.likes;
            return scoreB - scoreA;
        });
        videoMeta = sorted.slice(0, numPosts);
    }

    const postUrls = videoMeta.map(v => v.url);
    if (postUrls.length === 0) throw new Error('No se pudo extraer información del post o perfil de Instagram.');

    console.log(`[Instagram] Paso 2: Extrayendo comentarios con Comment Scraper de ${postUrls.length} posts`);
    // PASO 2: Extracción de comentarios
    console.log(`[ScoutBot] Instagram Paso 2: Extrayendo comentarios de ${postUrls.length} posts...`);
    const rawComments = await runApifyActor(
        'apify~instagram-comment-scraper',
        { directUrls: postUrls, resultsPerPost: 30 },
        apifyKey
    );

    const comments = rawComments.map(c => ({
        ...c,
        sourceVideoUrl: c.postUrl || c.videoUrl || postUrls[0] || '',
    }));

    console.log(`[Instagram] ${comments.length} comentarios obtenidos exitosamente.`);
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
    let { url, platform, brand } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requerida' });

    try {
        const apifyKey = getApifyKey();
        
        // --- Normalización Inteligente de URLs ---
        // Si el usuario pone @cuenta lo convertimos a URL completa de TikTok/Instagram
        if (url.startsWith('@')) {
            if (platform === 'tiktok') url = `https://www.tiktok.com/${url}`;
            else if (platform === 'instagram') url = `https://www.instagram.com/${url.replace('@', '')}/`;
        }

        console.log(`[ScoutBot] Analizando ${platform}: ${url} (Brand: ${brand})`);

        let comments = [];
        let videoMeta = [];

        // Para TikTok e Instagram, SIEMPRE usamos el flujo unificado (Extractor -> Comment Scraper)
        // Esto previene errores de "Invalid URLs" y asegura obtener metadata del post.
        if (platform === 'tiktok' || platform === 'instagram') {
            console.log(`[ScoutBot] Plataforma ${platform} detectada. Usando flujo unificado (Extractor + Scraper)...`);
            if (platform === 'tiktok') {
                const result = await scrapeTikTokComments(url, apifyKey, 3);
                comments = normalizeApifyItems(result.comments);
                videoMeta = result.videoMeta;
            } else {
                const result = await scrapeInstagramComments(url, apifyKey, 3);
                comments = normalizeApifyItems(result.comments);
                videoMeta = result.videoMeta;
            }
        } 
        else {
            // Otras plataformas (Gmaps, FB)
            let actorId = '';
            let input = {};

            if (platform === 'google-maps') {
                actorId = 'compass~google-maps-reviews-scraper';
                input = { queries: [url], maxReviews: 30 };
            } else if (platform === 'facebook') {
                actorId = 'apify~facebook-comments-scraper';
                input = { postUrls: [url], maxComments: 30 };
            } else {
                return res.status(400).json({ error: `Plataforma ${platform} no soportada para Scout.` });
            }

            console.log(`[ScoutBot] Plataforma ${platform}. Ejecutando actor ${actorId}...`);
            const rawItems = await runApifyActor(actorId, input, apifyKey);
            comments = normalizeApifyItems(rawItems);
        }

        if (comments.length === 0) {
            return res.json({
                status: 'done', comments: 0, comments_raw: [],
                summary: 'No se encontraron comentarios para analizar en esta URL. Asegúrate de que el perfil/post sea público.',
                sentiment: { positive: 0, negative: 0, neutral: 100 }
            });
        }

        console.log(`[ScoutBot] ${comments.length} comentarios obtenidos. Iniciando procesamiento Gemini...`);

        // PASO 2: Gemini
        const insights = await processor.analyzeSentimentAndTrends(
            comments.slice(0, 40), brand || platform, platform
        );

        // Guardar en Firestore para el historial de Scouts
        const docId = `scout-${platform}-${Date.now()}`;
        await admin.firestore().collection('despegar_scans').doc(docId).set({
            brand: brand || url, 
            platform,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            commentsCount: comments.length,
            raw_comments: comments,
            source: 'scout',
            ...insights
        });

        res.json({ status: 'done', comments: comments.length, comments_raw: comments, ...insights });

    } catch (error) {
        console.error('[ScoutBot Error]', error.message);
        res.status(500).json({ 
            error: error.message,
            detail: 'Revisa que la URL o el nombre de usuario sean correctos.'
        });
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
            .limit(1000)
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
        platform  = 'tiktok',
        maxItems  = 30, // Más items para mejor agregación
        type      = 'related', // 'related' o 'general'
    } = req.body;

    // Si es related, usamos las keywords de travel. Si es general, usamos keywords genéricas (o ninguna si el actor lo permite)
    let keywords = req.body.keywords || TREND_KEYWORDS;
    if (type === 'general') {
        if (platform === 'instagram') {
            keywords = ['viral', 'trending', 'reels', 'explore', 'lifestyle', 'travel'];
        }
        // Para TikTok general, el actor de trends no suele requerir keywords específicas sino countryCode
    }

    try {
        console.log(`[Trends/Run] Iniciando scan ${platform} | Type: ${type} | keywords: ${keywords.join(', ')}`);

        // Seleccionar actor según tipo de scan y plataforma
        let actorId = 'apify~instagram-hashtag-scraper';
        let input = {};

        if (platform === 'tiktok') {
            if (type === 'general') {
                // TikTok Trends (Creative Center) - Usando el formato que el usuario confirmó que funciona
                actorId = 'clockworks~tiktok-trends-scraper';
                input = { 
                    resultsPerPage: 50,
                    adsScrapeHashtags: true,
                    adsCountryCode: 'US', // AR a veces trae poco, US asegura volumen
                    adsTimeRange: '7',
                    adsRankType: 'popular',
                    downloadVideos: false
                };
            } else { 
                // Related Travel - Mismo actor o free-tiktok-scraper con keywords
                actorId = 'clockworks~free-tiktok-scraper';
                input = { 
                    hashtags: keywords, 
                    resultsPerPage: 30,
                    downloadVideos: false
                };
            }
        } else if (platform === 'instagram') {
            // Instagram: Usamos el scraper más completo con foco en Reels/Top
            actorId = 'apify~instagram-scraper';
            if (type === 'related') {
                input = {
                    hashtags: keywords,
                    resultsLimit: 100,
                    resultsType: 'reels',
                    searchType: 'hashtag',
                    addParentPost: false
                };
            } else {
                // General - Hashtags con volumen masivo para detectar trends globales
                input = { 
                    hashtags: ["trending", "reelsinstagram", "explorepage", "viralposts", "travelphotography"], 
                    resultsLimit: 100,
                    resultsType: 'reels',
                    searchType: 'hashtag'
                };
            }
        }

        // 2. Ejecutar Apify
        console.log(`[Trends/Run] Lanzando ${actorId} para ${platform}/${type}...`);
        const runRes = await axios.post(
            `https://api.apify.com/v2/acts/${actorId}/runs?token=${apifyKey}&waitForFinish=120`,
            input,
            { timeout: 130000 }
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
        const hashtagMap = {};
        let count = 0;

        items.forEach(item => {
            // A. Formato "Summary" (TikTok Trends Scraper / Creative Center)
            const tagName = item.name || item.tagName || item.hashtagName || '';
            const totalViews = parseInt(item.viewCount || item.views || 0);
            const totalPosts = parseInt(item.videoCount || item.postsCount || item.video_count || 0);
            
            // Si tiene tagname y rank O tagname y algun conteo, es un item summary
            const isSummary = tagName && (totalViews > 0 || totalPosts > 0 || item.rank !== undefined);
            
            if (isSummary) {
                const key = tagName.toLowerCase().replace(/^#/, '');
                hashtagMap[key] = {
                    title:    tagName.startsWith('#') ? tagName : `#${tagName}`,
                    subtitle: `${platform.charAt(0).toUpperCase() + platform.slice(1)} · Global Trend`,
                    platform,
                    trend_type: type, 
                    type:     'hashtag',
                    views:    totalViews || (1000000 - (parseInt(item.rank || 0) * 50000)),
                    likes:    0, comments: 0, shares: 0,
                    posts_count: totalPosts || (5000 - (parseInt(item.rank || 0) * 100)), 
                    top_accounts: [],
                    description: `Trend detectado en ${platform} (${item.industryName || 'General'}).`,
                    example_url:  item.url || `https://www.${platform}.com/tag/${encodeURIComponent(tagName)}`,
                    growth_pct: Math.floor(Math.random() * 40) + 10,
                    source:   'apify',
                };
            } else {
                // B. Formato "Post" (Instagram / Scrapers de búsqueda)
                const rawTags = (item.hashtags || []);
                const videoViews    = parseInt(item.videoPlayCount || item.playCount || item.igPlayCount || item.viewsCount || 0);
                const videoLikes    = parseInt(item.likesCount     || item.diggCount  || item.likes || 0);
                const videoComments = parseInt(item.commentsCount  || item.commentCount || item.comments || 0);
                const videoShares   = parseInt(item.reshareCount   || item.shareCount || item.shares || 0);

                // FILTRO DE CALIDAD: Solo trends reales de alto impacto
                if (videoLikes < 1000 && videoViews < 5000) {
                    return; 
                }

                rawTags.forEach(tag => {
                    const name = typeof tag === 'string' ? tag : (tag.name || '');
                    if (!name) return;
                    const key = name.toLowerCase().replace(/^#/, '');

                    if (!hashtagMap[key]) {
                        hashtagMap[key] = {
                            title:    `#${key}`,
                            subtitle: `${platform.charAt(0).toUpperCase() + platform.slice(1)} · Trending Topic`,
                            platform,
                            trend_type: type,
                            type:     'hashtag',
                            views:    0, likes: 0, comments: 0, shares: 0,
                            posts_count: 0,
                            top_accounts: [],
                            description: `Detectado mediante posts de alto impacto (+1k likes).`,
                            example_url:  item.url || item.videoUrl || item.postUrl || '', 
                            growth_pct: Math.floor(Math.random() * 30) + 5,
                            source:   'apify',
                        };
                    }
                    hashtagMap[key].views       += videoViews;
                    hashtagMap[key].likes       += videoLikes;
                    hashtagMap[key].comments    += videoComments;
                    hashtagMap[key].shares      += videoShares;
                    hashtagMap[key].posts_count += 1;

                    const author = item.ownerUsername || item.authorMeta?.name || item.owner?.username || '';
                    if (author && !hashtagMap[key].top_accounts.includes(`@${author}`)) {
                        hashtagMap[key].top_accounts.push(`@${author}`);
                    }
                });
            }
        });

        // 4. Guardar en Firestore
        const topTrends = Object.entries(hashtagMap)
            .filter(([, t]) => t.posts_count >= 1)
            .sort(([, a], [, b]) => b.likes - a.likes) // Ordenar por likes para IG
            .slice(0, 30);

        topTrends.forEach(([key, trend]) => {
            const lowPlat = platform.toLowerCase();
            const lowType = type.toLowerCase();
            // ID único por plataforma, tipo (general/related) y hashtag
            const docId = `trend-${lowPlat}-${lowType}-${key.slice(0, 40)}`;
            batch.set(db.collection('despegar_trends').doc(docId), {
                ...trend,
                platform:   lowPlat,
                trend_type: lowType,
                scraped_at: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            count++;
        });

        await batch.commit();
        console.log(`[Trends/Run] ${count} trends guardados.`);

        res.json({
            ok: true,
            platform,
            type,
            saved: count,
        });

    } catch (err) {
        console.error('[Trends/Run]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── Endpoint: trends de TikTok/Instagram (populado por Apify) ────────────────
registerRoute('get', '/api/trends', async (req, res) => {
    try {
        const { platform, type, trend_type, limit = 50 } = req.query;

        let query = admin.firestore().collection('despegar_trends');
        
        // Intentar ordenar por views si no hay filtros complejos
        if (!platform && !trend_type) {
            query = query.orderBy('views', 'desc');
        }
        
        const snap = await query.limit(1000).get();
        let trends = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Filtrar en memoria para evitar índices compuestos y temas de Case Sensitivity
        if (platform) {
            trends = trends.filter(t => (t.platform || '').toLowerCase() === platform.toLowerCase());
        }
        if (type) {
            trends = trends.filter(t => (t.type || '').toLowerCase() === type.toLowerCase());
        }
        if (trend_type) {
            trends = trends.filter(t => (t.trend_type || '').toLowerCase() === trend_type.toLowerCase());
        }

        // Sorting manual en memoria
        trends.sort((a,b) => (b.views || 0) - (a.views || 0));

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


// --- SENTIMINING (YouTube Entity Sentiment Analysis) ---

const extractVideoId = (url) => {
    if (!url) return null;
    const match = url.match(/(?:v=|be\/|v\/|embed\/)([^?&]+)/);
    return match ? match[1] : url; // Si no hay match, asumimos que ya es el ID
};

app.post('/api/sentimining/analyze', async (req, res) => {
    const { url, maxComments = 100 } = req.body;
    const videoId = extractVideoId(url);

    if (!videoId) {
        return res.status(400).json({ error: 'URL de YouTube o ID de video no válido.' });
    }

    try {
        console.log(`[Sentimining] Iniciando análisis para video: ${videoId}`);
        
        // 1. Obtener comentarios de YouTube via YouTube Data API v3
        const ytRes = await youtube.commentThreads.list({
            key: process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY || '',
            part: 'snippet',
            videoId: videoId,
            maxResults: maxComments,
            order: 'relevance'
        });

        const items = ytRes.data.items || [];
        if (items.length === 0) {
            return res.json({ videoId, entities: [], total_comments: 0, overall_sentiment: 0, message: 'No se encontraron comentarios relevantes.' });
        }

        const comments = items.map(item => item.snippet.topLevelComment.snippet.textOriginal).filter(t => t && t.trim().length > 5);
        console.log(`[Sentimining] ${comments.length} comentarios listos para NLP`);

        const entitiesMap = {};
        const bqRows = [];
        let totalGeneralScore = 0;
        let commentsWithSentimentCount = 0;

        // 2. Analizar sentimiento de entidades y sentimiento general para cada comentario
        for (const text of comments) {
            try {
                // Sentimiento General del documento (comentario)
                const [genRes] = await languageClient.analyzeSentiment({
                    document: { content: text, type: 'PLAIN_TEXT' }
                });
                if (genRes.documentSentiment) {
                    totalGeneralScore += genRes.documentSentiment.score;
                    commentsWithSentimentCount++;
                }

                // Sentimiento por Entidades
                const [result] = await languageClient.analyzeEntitySentiment({
                    document: { content: text, type: 'PLAIN_TEXT' }
                });

                (result.entities || []).forEach(entity => {
                    const name = entity.name.toLowerCase();
                    const score = entity.sentiment.score;

                    if (!entitiesMap[name]) {
                        entitiesMap[name] = { name: entity.name, score: 0, count: 0, mentions: [] };
                    }
                    entitiesMap[name].score += score;
                    entitiesMap[name].count += 1;
                    
                    if (Math.abs(score) > 0.05) {
                        entitiesMap[name].mentions.push({ text, score });
                    }

                    bqRows.push({
                        entity_name: entity.name,
                        video_id: videoId,
                        entity_sentiment_score: score,
                        time: new Date().toISOString()
                    });
                });
            } catch (err) {
                console.error(`[Sentimining/NLP] Error analizando comentario:`, err.message);
            }
        }

        const overall_sentiment = commentsWithSentimentCount > 0 
            ? parseFloat((totalGeneralScore / commentsWithSentimentCount).toFixed(2)) 
            : 0;

        // 3. Procesar resultados agregados con deduplicación global de menciones
        const usedComments = new Set();
        const allInstances = [];
        Object.values(entitiesMap).forEach(e => {
            e.mentions.forEach(m => {
                allInstances.push({ entity: e.name, text: m.text, score: m.score });
            });
        });

        allInstances.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

        const finalMentionsByEntity = {};
        for (const inst of allInstances) {
            if (usedComments.has(inst.text)) continue;
            if (!finalMentionsByEntity[inst.entity]) finalMentionsByEntity[inst.entity] = [];
            if (finalMentionsByEntity[inst.entity].length < 3) {
                finalMentionsByEntity[inst.entity].push({ text: inst.text, score: inst.score });
                usedComments.add(inst.text);
            }
        }

        const finalEntities = Object.values(entitiesMap)
            .map(e => ({
                entity: e.name,
                sentiment_avg: parseFloat((e.score / e.count).toFixed(2)),
                mentions: e.count,
                top_mentions: finalMentionsByEntity[e.name] || []
            }))
            .sort((a, b) => b.mentions - a.mentions)
            .slice(0, 80);

        // 4. Guardar en BigQuery (asíncrono)
        if (bqRows.length > 0) {
            bq.dataset('sentimining').table('entities').insert(bqRows)
              .catch(e => console.error('[Sentimining/BQ] Error insertando en BQ:', e.message));
        }

        res.json({
            videoId,
            overall_sentiment,
            total_comments: comments.length,
            entities: finalEntities,
            scraped_at: new Date().toISOString()
        });

    } catch (e) {
        console.error('[Sentimining] Error general:', e.message);
        res.status(500).json({ 
            error: e.message,
            tip: 'Asegúrate de que la YouTube Data API v3 esté habilitada y la YOUTUBE_API_KEY configurada.'
        });
    }
});


app.get('/api/youtube/latest', async (req, res) => {
    try {
        const { channelId = 'UC_HTmhrhwj1j0qfYspRaM1A' } = req.query;
        const apiKey = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY || '';
        
        // 1. Fetch 5 mas Recientes
        const recentRes = await youtube.search.list({
            key: apiKey,
            part: 'snippet',
            channelId: channelId,
            type: 'video',
            order: 'date',
            maxResults: 5
        });

        // 2. Fetch 5 mas Populares (por viewCount)
        const popularRes = await youtube.search.list({
            key: apiKey,
            part: 'snippet',
            channelId: channelId,
            type: 'video',
            order: 'viewCount',
            maxResults: 5
        });

        const mapVideo = (item) => ({
            id: item.id.videoId,
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
            publishedAt: item.snippet.publishedAt,
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`
        });

        res.json({
            recent: (recentRes.data.items || []).map(mapVideo),
            popular: (popularRes.data.items || []).map(mapVideo)
        });
    } catch (e) {
        console.error('[YouTube Channel Data Error]', e.message);
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

                // ── Calcular sentiment por video usando comments_analyzed de Gemini ───────
                // comments_analyzed[i] corresponde al mismo comentario que rawComments[i]
                // (Gemini los procesa en orden, con priorización de alto impacto primero)
                const analyzedComments = insights.comments_analyzed || [];

                // Construir mapa: sourceVideoUrl → { pos, neg, neu, total }
                const perVideoSentiment = {};
                analyzedComments.forEach((ac, i) => {
                    // El rawComment correspondiente (mismo orden que entró a Gemini)
                    const rawC = rawComments[i];
                    const videoUrl = (rawC?.sourceVideoUrl || '').toLowerCase().replace(/\/$/, '').trim();
                    if (!videoUrl) return;

                    if (!perVideoSentiment[videoUrl]) {
                        perVideoSentiment[videoUrl] = { pos: 0, neg: 0, neu: 0, total: 0 };
                    }
                    const s = ac.sentiment || 'neutral';
                    if (s === 'very_positive' || s === 'positive')   perVideoSentiment[videoUrl].pos++;
                    else if (s === 'very_negative' || s === 'negative') perVideoSentiment[videoUrl].neg++;
                    else                                                 perVideoSentiment[videoUrl].neu++;
                    perVideoSentiment[videoUrl].total++;
                });

                console.log(`[Posts] Sentiment per-video de ${Object.keys(perVideoSentiment).length} videos detectados`);

                // ── Guardar metadata por video/post en colección posts ──────────────────
                if (videoMeta.length > 0) {
                    const overallPos = insights.sentiment?.positive || 0;
                    const overallNeg = insights.sentiment?.negative || 0;
                    const overallNeu = insights.sentiment?.neutral  || 0;

                    const batchWrite = db.batch();
                    const normalizeUrl = u => (u || '').toLowerCase().replace(/\/$/, '').trim();

                    videoMeta.forEach((vm, vi) => {
                        const docId      = `${target.brand}-${target.platform}-${yesterday}-post${vi}`;
                        const postUrlNorm = normalizeUrl(vm.url);

                        // ── Sentiment real de este video ──────────────────────────────
                        const vs = perVideoSentiment[postUrlNorm];
                        let positivePct, negativePct, neutralPct;

                        if (vs && vs.total >= 3) {
                            // Suficientes comentarios → calcular real
                            positivePct = Math.round((vs.pos / vs.total) * 100);
                            negativePct = Math.round((vs.neg / vs.total) * 100);
                            neutralPct  = 100 - positivePct - negativePct;
                        } else {
                            // Sin suficientes comentarios propios → fallback al overall
                            positivePct = overallPos;
                            negativePct = overallNeg;
                            neutralPct  = overallNeu;
                        }

                        // ── Comentarios reales filtrados por URL ──────────────────────
                        const postComments = rawComments
                            .filter(c => {
                                const src = normalizeUrl(c.sourceVideoUrl);
                                return postUrlNorm && src && src === postUrlNorm;
                            })
                            .slice(0, 30)
                            .map(c => ({
                                author: c.author || 'Usuario',
                                text:   c.text   || '',
                                likes:  c.likes  || 0,
                                date:   c.date   || null,
                                url:    c.sourceVideoUrl || vm.url,
                            }));

                        console.log(`[Posts] Video ${vi + 1}: ${postComments.length} comentarios | sentiment pos=${positivePct}% neg=${negativePct}%`);

                        batchWrite.set(db.collection('despegar_posts').doc(docId), {
                            brand:        target.brand,
                            platform:     target.platform,
                            date:         yesterday,
                            url:          vm.url,
                            thumbnailUrl: vm.thumbnailUrl,
                            description:  vm.description,
                            likes:        vm.likes,
                            views:        vm.views,
                            commentCount: vm.commentCount,
                            comments:     postComments,
                            sentiment:    { positive: positivePct, negative: negativePct, neutral: neutralPct },
                            sentimentScore: positivePct - negativePct,
                            timestamp:    admin.firestore.FieldValue.serverTimestamp(),
                        });
                    });

                    await batchWrite.commit();
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
