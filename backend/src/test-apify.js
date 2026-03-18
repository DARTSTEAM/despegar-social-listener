const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.APIFY_API_KEY;

async function testTikTokScraper() {
    console.log("🚀 Iniciando Test de Scraper de TikTok...");

    // Usaremos el actor "clockworks/tiktok-comments-scraper" que es eficiente
    const actorId = "clockworks~tiktok-comments-scraper";
    const input = {
        "postURLs": [
            "https://www.tiktok.com/@papajohnsperu/video/7608291797474888967"
        ],
        "commentsPerPost": 30,
        "maxRepliesPerComment": 0
    };

    try {
        console.log(`[Apify] Lanzando actor ${actorId}...`);
        const response = await axios.post(`https://api.apify.com/v2/acts/${actorId}/runs?token=${API_KEY}`, input);
        const runId = response.data.data.id;
        const datasetId = response.data.data.defaultDatasetId;

        console.log(`✅ Run iniciado! ID: ${runId}`);
        console.log(`📊 Dataset ID: ${datasetId}`);
        console.log(`⏳ Esperando unos segundos para que procese...`);

        // Esperamos un poco para ver si hay resultados (en producción usaríamos webhooks)
        setTimeout(async () => {
            const results = await axios.get(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${API_KEY}`);
            console.log(`📈 Resultados obtenidos: ${results.data.length} comentarios.`);
            console.log("Primer comentario:", results.data[0]?.text || "No hay comentarios todavía.");
        }, 15000);

    } catch (error) {
        console.error("❌ Error en el test:", error.response?.data || error.message);
    }
}

testTikTokScraper();
