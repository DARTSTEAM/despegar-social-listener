const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const ApifyConnector = require('./connectors/apify');
const InsightProcessor = require('./agents/processor');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const apify = new ApifyConnector(process.env.APIFY_API_KEY);
const processor = new InsightProcessor(process.env.GEMINI_API_KEY);

// ─── PERSISTENCIA EN JSON ────────────────────────────────────────────────────
const STORE_PATH = path.join(__dirname, 'data', 'store.json');

function loadStore() {
    try {
        if (fs.existsSync(STORE_PATH)) {
            const raw = fs.readFileSync(STORE_PATH, 'utf-8');
            const parsed = JSON.parse(raw);
            console.log(`[Store] Cargados ${parsed.length} registros desde store.json`);
            return parsed;
        }
    } catch (e) {
        console.error('[Store] Error al cargar store.json:', e.message);
    }
    return [];
}

function saveStore() {
    try {
        fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
        fs.writeFileSync(STORE_PATH, JSON.stringify(scanStore, null, 2), 'utf-8');
    } catch (e) {
        console.error('[Store] Error al guardar store.json:', e.message);
    }
}

let scanStore = loadStore();

// ─── HELPERS ────────────────────────────────────────────────────────────────
function getBrandsStatus() {
    const status = {};
    for (const entry of scanStore) {
        if (!status[entry.brand]) {
            status[entry.brand] = { count: 0, lastUpdated: null };
        }
        status[entry.brand].count += 1;
        const t = new Date(entry.timestamp);
        if (!status[entry.brand].lastUpdated || t > new Date(status[entry.brand].lastUpdated)) {
            status[entry.brand].lastUpdated = entry.timestamp;
        }
    }
    return status;
}

function buildReport() {
    const byBrand = {};
    for (const e of scanStore) {
        if (!byBrand[e.brand]) byBrand[e.brand] = [];
        byBrand[e.brand].push(e);
    }
    const brandPerf = Object.entries(byBrand).map(([brand, entries]) => {
        const avgPos = Math.round(entries.reduce((a, b) => a + b.sentiment.positive, 0) / entries.length);
        return {
            brand,
            status: avgPos >= 80 ? 'Growing' : avgPos >= 60 ? 'Stable' : 'At Risk',
            keyFinding: `Sentimiento positivo promedio: ${avgPos}% (${entries.length} scans).`
        };
    });
    return {
        executiveBrief: `Semana con performance sólida liderada por Bembos en TikTok. El engagement en plataforma digital muestra correlación positiva con el flujo en locales físicos.`,
        brandPerformance: brandPerf.length > 0 ? brandPerf : [
            { brand: 'Bembos', status: 'Growing', keyFinding: 'Sin datos aún — ejecutá Cold Start.' }
        ],
        topStrategicRisk: 'Posible saturación de promociones en canal digital.',
        nextSteps: ['Optimizar pauta en TikTok', 'Reforzar stock de salsas en zona sur']
    };
}

// ─── ROUTES: SCOUT BOT ───────────────────────────────────────────────────────

// Scout Bot — lanzar scraper
app.post('/api/scout', async (req, res) => {
    const { url, platform } = req.body;
    try {
        console.log(`[Server] Scrapeando URL: ${url} en ${platform}`);
        let actorId = "clockworks~tiktok-comments-scraper";
        let input = { "postURLs": [url], "commentsPerPost": 20, "maxRepliesPerComment": 0 };

        if (platform === 'instagram') {
            actorId = "jaroslavsemanko~instagram-comment-scraper";
            input = { "directUrls": [url], "resultsLimit": 20 };
        } else if (platform === 'google-maps') {
            actorId = "compass~google-maps-reviews-scraper";
            input = { "queries": [url], "maxReviews": 20 };
        } else if (platform === 'facebook') {
            actorId = "apify~facebook-comments-scraper";
            input = { "postUrls": [url], "maxComments": 20 };
        }

        const run = await apify.launchScraper(actorId, input);
        res.json({ status: 'processing', runId: run.id, datasetId: run.defaultDatasetId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper: normaliza items de Apify al formato {text, author, followers} sin importar la plataforma
function normalizeApifyItems(items) {
    return items.map(item => ({
        text: item.text || item.commentText || item.reviewText || item.message || item.comment || '',
        author: item.uniqueId || item.ownerUsername || item.profileName || item.name || 'Usuario',
        followers: item.authorStats?.followerCount || item.owner?.followersCount || item.followersCount || 0,
        likes: item.diggCount || item.likesCount || item.likes || 0,
    })).filter(c => c.text.trim().length > 0);
}

// Scout Bot — insights de un dataset con Gemini real
app.get('/api/insights/:datasetId', async (req, res) => {
    try {
        const { platform = 'social', brand = 'NGR' } = req.query;
        const raw = await apify.getResults(req.params.datasetId);
        const comments = normalizeApifyItems(raw);

        let insights = { sentiment: { positive: 50, neutral: 45, negative: 5 }, topTopics: [], summary: 'Sin análisis aún.' };
        if (comments.length > 0) {
            // Pasamos objetos ricos con metadata de cuenta, no solo texto
            insights = await processor.analyzeSentimentAndTrends(comments, brand, platform);
        }

        res.json({
            comments: comments.length,
            comments_raw: comments,
            ...insights
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mock Cuántico
app.get('/api/cuantico/summary', (req, res) => {
    res.json([
        { brand: 'Bembos', sentiment: 'Favorable', alert: 'Tendencia positiva en salsa parrillera', date: 'Hoy' },
        { brand: 'Popeyes', sentiment: 'Neutral', alert: 'Quejas por demora en delivery', date: 'Ayer' },
        { brand: 'China Wok', sentiment: 'Muy Favorable', alert: 'Nueva promo viral en TikTok', date: 'Hoy' }
    ]);
});

// ─── ROUTES: DATOS ───────────────────────────────────────────────────────────

// History — últimas 20 entradas (sin raw_comments para aligerar payload)
app.get('/api/history', (req, res) => {
    const history = scanStore.slice(-20).reverse().map(e => ({
        brand: e.brand,
        platform: e.platform,
        timestamp: e.timestamp,
        sentiment: e.sentiment,
        commentsCount: e.commentsCount,
        topTopics: e.topTopics,
        summary: e.summary
    }));
    res.json(history);
});

// Historical — registros crudos con filtros opcionales
app.get('/api/historical', (req, res) => {
    const { brand, platform } = req.query;
    let results = scanStore;
    if (brand) results = results.filter(e => e.brand === brand);
    if (platform) results = results.filter(e => e.platform === platform);
    res.json(results);
});

// Alerts — sentimiento negativo > 15%
app.get('/api/alerts', (req, res) => {
    const alerts = scanStore
        .filter(e => e.sentiment.negative > 15)
        .map(e => ({
            brand: e.brand,
            platform: e.platform,
            message: `Sentimiento negativo elevado: ${e.sentiment.negative}%`,
            timestamp: e.timestamp
        }));
    res.json(alerts);
});

// Brands Status — estado de scans por marca para la Intelligence Matrix
app.get('/api/admin/brands-status', (req, res) => {
    res.json(getBrandsStatus());
});

// Reports — reporte semanal: Gemini si hay datos, fallback demo si no
app.get('/api/reports', async (req, res) => {
    if (scanStore.length === 0) {
        // Sin datos: devolver demo con flag para que el frontend lo indique
        return res.json({
            _isDemo: true,
            executiveBrief: "Sin datos aún. Ejecutá un Cold Start o un Escaneo Masivo para generar el informe real.",
            brandPerformance: [{ brand: 'Bembos', status: 'Pending', keyFinding: 'Esperando primer scan.' }],
            topStrategicRisk: 'No hay datos suficientes para evaluar riesgos.',
            nextSteps: ['Ejecutar Cold Start', 'Ejecutar Escaneo Masivo']
        });
    }

    // Con datos reales: intentar generar con Gemini, si falla usar buildReport()
    try {
        const last7 = scanStore.slice(-70); // hasta 70 entries (10 marcas x 7 días)
        const summaries = last7.map(e => ({
            brand: e.brand, platform: e.platform,
            summary: e.summary, sentiment: e.sentiment
        }));
        const geminiReport = await processor.generateWeeklyExecutiveBriefing(summaries);
        if (geminiReport) return res.json(geminiReport);
    } catch (e) {
        console.warn('[Reports] Gemini falló, usando buildReport() estático:', e.message);
    }

    res.json(buildReport());
});

// ─── ROUTES: ADMIN ───────────────────────────────────────────────────────────

// Cold Start — poblar 7 días con datos realistas para Bembos
app.post('/api/admin/seed-history', (req, res) => {
    console.log('[Server] Cold Start: Poblando 7 días de historial para Bembos TikTok...');

    const bembosComments = [
        [
            { author: 'carla_foodie', text: 'La Hamburguesa Carretillera es de otro nivel, la salsa parrillera me voló la cabeza 🔥', followers: 4200 },
            { author: 'rodrigo_eater', text: 'Fui a Bembos Miraflores y la atención fue excelente, volvería mañana mismo', followers: 810 },
            { author: 'miguelito_qr', text: 'El combo triple viene bien servido, nada que ver con la competencia', followers: 290 },
            { author: 'sofiperu22', text: 'Gracias Bembos por el descuento de cumpleaños! Muy detallistas', followers: 1350 },
            { author: 'juan_hambre', text: 'Colas largas en la sucursal de San Isidro pero el resultado vale la espera', followers: 540 },
        ],
        [
            { author: 'paty_eats', text: 'Las papas Bembos son las mejores que he probado, ni McDonalds las supera', followers: 7800 },
            { author: 'elmago_chef', text: 'Nueva campaña de TikTok de Bembos es fuego, ya me antojé', followers: 3100 },
            { author: 'kevin_delivery', text: 'Pedí por app y llegó en 25 min, perfecto para el almuerzo', followers: 220 },
            { author: 'valeria_lc', text: 'El sabor de la carne es consistente, siempre igual de bueno', followers: 900 },
            { author: 'mrfoodie_pe', text: 'Bembos sigue siendo el rey de las hamburguesas en Lima', followers: 15600 },
        ],
        [
            { author: 'tomas_grill', text: 'Probé el Bembos Gold por primera vez y no me decepcionó', followers: 430 },
            { author: 'andrea_taste', text: 'Me sorprendió lo fresca que estaba la lechuga, se nota la calidad', followers: 1890 },
            { author: 'franco_comenta', text: 'El precio subió un poco pero la porción también mejoró', followers: 670 },
            { author: 'luisa_review', text: 'Atención al cliente de primera, me cambiaron una orden sin problema', followers: 310 },
            { author: 'pepito_viral', text: '¡el spot nuevo en tiktok! literalmente me hizo pedir un Bembos a las 11pm', followers: 22000 },
        ],
        [
            { author: 'carlos_nomad', text: 'Me gusta que tienen WiFi, puedo trabajar desde el local', followers: 550 },
            { author: 'gabi_foodlover', text: 'La salsa BBQ de Bembos es adictiva, pido siempre doble', followers: 1200 },
            { author: 'rich_taste', text: 'Ambiente limpio y cómodo, perfecto para ir en familia', followers: 870 },
            { author: 'yumi_peru', text: 'Combiné el combo con su limonada frozen y fue un acierto total', followers: 4500 },
            { author: 'alex_hamb', text: 'Se demoran un poco en hora punta pero el producto siempre sale bien', followers: 380 },
        ],
        [
            { author: 'paola_ig', text: 'Me pidió mi novio Bembos para ver la final y no me arrepiento', followers: 2100 },
            { author: 'jhonn_crispy', text: 'Las alas de pollo Bembos son lo mejor que han lanzado últimamente', followers: 990 },
            { author: 'camila_tiktok', text: 'Ese video del chef haciendo la Carretillera en el local me convenció al toque', followers: 31000 },
            { author: 'diego_eats', text: 'La app de Bembos mejoró bastante, ahora el tracking de delivery es exacto', followers: 620 },
            { author: 'tony_grill', text: 'Primera vez que como Bembos y ya soy fan, ¿dónde estaba toda mi vida?', followers: 175 },
        ],
        [
            { author: 'fernanda_bites', text: 'El jueves a media tarde estaba casi vacío y el servicio fue rapidísimo', followers: 1440 },
            { author: 'omar_foodie', text: 'La carne al punto exacto, ni muy cocida ni cruda. Top', followers: 720 },
            { author: 'silvia_chef', text: 'Bembos demuestra que la calidad local puede competir con cualquier internacional', followers: 5200 },
            { author: 'pepe_critico', text: 'La mesa estaba un poco sucia cuando llegué, pero después todo bien', followers: 280 },
            { author: 'martin_gamer', text: 'Community manager de Bembos en TikTok está haciendo un trabajo excelente', followers: 8700 },
        ],
        [
            { author: 'nat_comenta', text: 'El Bembos Clásico nunca falla, es mi combo de siempre desde hace 10 años', followers: 930 },
            { author: 'ric_delivery', text: 'Empaque sostenible de cartón me parece un gran detalle de la marca', followers: 460 },
            { author: 'ana_viral', text: 'Vi el trend de Bembos en TikTok y tuve que ir ese mismo día jaja', followers: 17800 },
            { author: 'leo_review', text: 'Precio justo para la calidad que ofrecen, sin dudas el mejor fast food peruano', followers: 1100 },
            { author: 'pablo_late', text: 'A las 11pm todavía atienden perfecto, ideal para los noctámbulos', followers: 560 },
        ]
    ];

    const topicsPool = [
        ["Hamburguesa Carretillera", "Atención al cliente", "Precio", "Sabor"],
        ["TikTok Viral", "Delivery", "Papas fritas", "Combo"],
        ["Calidad", "Ambiente", "App Bembos", "Salsas"],
        ["Campaña Digital", "Personal", "Empaque", "Experiencia"]
    ];

    const newEntries = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(12, 30, 0, 0);

        const comments = bembosComments[i % bembosComments.length];
        const topics = topicsPool[i % topicsPool.length];
        const positivePct = 82 + Math.floor(Math.random() * 8);
        const negativePct = 3 + Math.floor(Math.random() * 6);
        const neutralPct = 100 - positivePct - negativePct;

        newEntries.push({
            brand: 'Bembos',
            platform: 'tiktok',
            timestamp: date.toISOString(),
            sentiment: { positive: positivePct, neutral: neutralPct, negative: negativePct },
            commentsCount: comments.length,
            topTopics: topics,
            summary: `Comentarios del día reflejan alta satisfacción con la Carretillera y presencia viral en TikTok. Sentimiento positivo: ${positivePct}%.`,
            raw_comments: comments,
            source: 'seed'
        });
    }

    scanStore = [...scanStore, ...newEntries];
    saveStore();  // ← persiste al disco

    console.log(`[Server] Cold Start completado. ${newEntries.length} entradas insertadas. Total en store: ${scanStore.length}`);
    res.json({ success: true, inserted: newEntries.length, total: scanStore.length });
});

// Scout All — lanza Apify para todas las marcas, guarda resultados con Gemini real
app.post('/api/admin/scout-all', async (req, res) => {
    res.json({ status: 'started', message: 'Escaneo iniciado para todas las marcas en 2do plano.' });

    const brands = [
        { brand: 'Bembos', platform: 'tiktok', handle: 'bembos.oficial' },
        { brand: 'Papa Johns', platform: 'tiktok', handle: 'papajohnsperu' },
        { brand: 'McDonalds', platform: 'tiktok', handle: 'mcdonaldsperu' },
        { brand: 'Burger King', platform: 'tiktok', handle: 'burgerking_peru' },
        { brand: 'KFC', platform: 'tiktok', handle: 'kfcperu' },
        { brand: 'Popeyes', platform: 'tiktok', handle: 'popeyesperuoficial' },
        { brand: 'China Wok', platform: 'tiktok', handle: 'chinawokperu' },
        { brand: 'Dunkin Donuts', platform: 'instagram', handle: 'dunkindonutsperu' },
    ];

    for (const b of brands) {
        try {
            // Seleccionar actor e input según plataforma
            let actorId, input;
            if (b.platform === 'instagram') {
                actorId = "jaroslavsemanko~instagram-comment-scraper";
                input = {
                    "directUrls": [`https://www.instagram.com/${b.handle}/`],
                    "resultsLimit": 20
                };
            } else {
                // TikTok — acepta URL de perfil o de video
                actorId = "clockworks~tiktok-comments-scraper";
                input = {
                    "postURLs": [`https://www.tiktok.com/@${b.handle}`],
                    "commentsPerPost": 20,
                    "maxRepliesPerComment": 0
                };
            }

            console.log(`[Scout-All] Lanzando scraper para ${b.brand} (${b.platform})...`);
            const run = await apify.launchScraper(actorId, input);
            const datasetId = run.defaultDatasetId;
            console.log(`[Scout-All] ${b.brand} run: ${run.id} | dataset: ${datasetId}`);

            // Esperar 40s para que Apify procese
            await new Promise(r => setTimeout(r, 40000));

            // Obtener resultados
            let rawItems = [];
            try {
                rawItems = await apify.getResults(datasetId);
            } catch (fetchErr) {
                console.warn(`[Scout-All] No se pudo obtener resultados de ${b.brand}:`, fetchErr.message);
            }

            const comments = normalizeApifyItems(rawItems);

            if (comments.length === 0) {
                console.log(`[Scout-All] ${b.brand}: 0 comentarios — omitiendo.`);
                continue;
            }

            // Análisis Gemini — pasamos objetos ricos con metadata de cuenta
            let insights = { sentiment: { positive: 50, neutral: 45, negative: 5 }, topTopics: [], summary: 'Sin análisis.' };
            try {
                insights = await processor.analyzeSentimentAndTrends(comments, b.brand, b.platform);
            } catch (geminiErr) {
                console.warn(`[Scout-All] Gemini falló para ${b.brand}:`, geminiErr.message);
            }

            // Guardar en store + persistir
            const entry = {
                brand: b.brand,
                platform: b.platform,
                timestamp: new Date().toISOString(),
                sentiment: insights.sentiment || { positive: 50, neutral: 45, negative: 5 },
                sentiment_breakdown: insights.sentiment_breakdown || {},
                commentsCount: comments.length,
                topTopics: insights.topTopics || [],
                topicClusters: insights.topicClusters || [],
                comments_analyzed: insights.comments_analyzed || [],
                alerts: insights.alerts || [],
                wordCloud: insights.wordCloud || [],
                summary: insights.summary || '',
                recommendations: insights.recommendations || [],
                suggestedReplies: insights.suggestedReplies || [],
                raw_comments: comments.slice(0, 25),
                source: 'apify',
                runId: run.id,
                datasetId,
                totalProcessed: insights.totalProcessed || comments.length
            };

            scanStore.push(entry);
            saveStore();  // ← persiste al disco después de cada marca

            console.log(`[Scout-All] ✅ ${b.brand}: ${comments.length} comentarios guardados. Sentimiento positivo: ${entry.sentiment.positive}%`);

        } catch (e) {
            console.error(`[Scout-All] ❌ Error en ${b.brand}:`, e.message);
        }
    }

    console.log('[Scout-All] ✅ Escaneo masivo completado.');
});

// ─── START ───────────────────────────────────────────────────────────────────
app.listen(port, () => {
    console.log(`🚀 NGR Social Server corriendo en http://localhost:${port}`);
    console.log(`📦 Store cargado con ${scanStore.length} registros`);
});
