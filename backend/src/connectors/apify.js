const axios = require('axios');

class ApifyConnector {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.apify.com/v2';
    }

    /**
     * Lanza un scraper para TikTok o Instagram
     * @param {string} actorId - El ID del scraper en Apify (ej. 'apify/tiktok-scraper')
     * @param {object} input - Configuración del scraper (urls, keywords, etc)
     */
    async launchScraper(actorId, input) {
        try {
            console.log(`[Apify] Iniciando scraper ${actorId}...`);
            const response = await axios.post(`${this.baseUrl}/acts/${actorId}/runs?token=${this.apiKey}`, input);
            return response.data.data;
        } catch (error) {
            console.error('[Apify] Error lanzando scraper:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Obtiene los resultados de un dataset
     * @param {string} datasetId 
     */
    async getResults(datasetId) {
        try {
            const response = await axios.get(`${this.baseUrl}/datasets/${datasetId}/items?token=${this.apiKey}`);
            return response.data;
        } catch (error) {
            console.error('[Apify] Error obteniendo resultados:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = ApifyConnector;
