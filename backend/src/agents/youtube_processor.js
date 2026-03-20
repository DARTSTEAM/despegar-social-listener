const { google } = require('googleapis');
const axios = require('axios');

class YoutubeProcessor {
    constructor() {
        this.youtube = google.youtube('v3');
    }

    async getComments(videoId, apiKey) {
        try {
            const res = await this.youtube.commentThreads.list({
                part: 'snippet',
                videoId: videoId,
                maxResults: 50,
                key: apiKey
            });
            return res.data.items.map(item => item.snippet.topLevelComment.snippet.textDisplay);
        } catch (e) {
            console.error("[YoutubeProcessor] Error fetching comments:", e.message);
            throw e;
        }
    }

    async analyzeSentimentInBulk(texts, apiKey) {
        const results = [];
        // Limitar a los primeros 20 para no exceder cuotas/tiempos en una sola request
        for (const text of texts.slice(0, 20)) {
            try {
                const url = `https://language.googleapis.com/v1/documents:analyzeSentiment?key=${apiKey}`;
                const response = await axios.post(url, {
                    document: {
                        content: text,
                        type: 'PLAIN_TEXT'
                    },
                    encodingType: 'UTF8'
                });

                const sentiment = response.data.documentSentiment;
                results.push({
                    text: text.substring(0, 150),
                    score: sentiment.score, // -1 a +1
                    magnitude: sentiment.magnitude
                });
            } catch (e) {
                console.error(`[YoutubeProcessor] Error analyzing sentiment for: ${text.substring(0, 20)}`, e.message);
                // Continuar con los demás si uno falla
            }
        }
        return results;
    }
}

module.exports = YoutubeProcessor;
