const axios = require('axios');
require('dotenv').config();

async function checkDataset(datasetId) {
    const API_KEY = process.env.APIFY_API_KEY;
    try {
        const results = await axios.get(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${API_KEY}`);
        console.log("ITEMS REALES:", JSON.stringify(results.data, null, 2));
    } catch (e) {
        console.error(e);
    }
}

checkDataset("m86ZzYV5ggLqRXjb1");
