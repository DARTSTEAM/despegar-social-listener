/**
 * InsightProcessor (Backend local) — espejo de functions/processor.js
 * Usar gemini-2.0-flash, batching, análisis por comentario, categorías granulares.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');

const BATCH_SIZE = 25;
const MAX_COMMENTS = 100;
const HIGH_FOLLOWER_THRESHOLD = 5000;

class InsightProcessor {
    constructor() {
        const API_KEY = process.env.GEMINI_API_KEY || '';
        console.log('[Processor] Inicializando. Gemini key length:', API_KEY.length);
        try {
            this.genAI = new GoogleGenerativeAI(API_KEY);
            this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        } catch (e) {
            console.error('[Processor] Error al inicializar Gemini:', e.message);
            this.model = null;
        }
    }

    _getImpactLabel(followers = 0) {
        if (followers >= 10000) return 'high';
        if (followers >= 1000) return 'medium';
        return 'low';
    }

    _formatCommentsForPrompt(comments) {
        return comments.map((c, i) => {
            const impact = this._getImpactLabel(c.followers);
            return `[${i + 1}] @${c.author} (${(c.followers || 0).toLocaleString()} seguidores, impacto: ${impact})\n"${c.text}"${c.likes ? ` [${c.likes} likes]` : ''}`;
        }).join('\n\n');
    }

    _aggregateBatchResults(batchResults, allComments) {
        if (batchResults.length === 0) return null;
        if (batchResults.length === 1) return batchResults[0];

        const sentimentKeys = ['positive', 'neutral', 'negative'];
        const granularKeys = ['very_positive', 'positive', 'neutral', 'negative', 'very_negative'];
        const aggregatedSentiment = {};
        const aggregatedGranular = {};

        sentimentKeys.forEach(k => {
            aggregatedSentiment[k] = Math.round(
                batchResults.reduce((sum, r) => sum + (r.sentiment?.[k] ?? 0), 0) / batchResults.length
            );
        });
        granularKeys.forEach(k => {
            aggregatedGranular[k] = Math.round(
                batchResults.reduce((sum, r) => sum + (r.sentiment_breakdown?.[k] ?? 0), 0) / batchResults.length
            );
        });

        const sentTotal = Object.values(aggregatedSentiment).reduce((a, b) => a + b, 0);
        if (sentTotal !== 100) aggregatedSentiment.neutral = (aggregatedSentiment.neutral || 0) + (100 - sentTotal);

        const allTopics = batchResults.flatMap(r => r.topTopics || []);
        const topTopics = [...new Set(allTopics)].slice(0, 8);

        const mergedClusters = [];
        batchResults.flatMap(r => r.topicClusters || []).forEach(cluster => {
            const ex = mergedClusters.find(c => c.label.toLowerCase() === cluster.label.toLowerCase());
            if (ex) ex.count += cluster.count;
            else mergedClusters.push({ ...cluster });
        });
        mergedClusters.sort((a, b) => b.count - a.count);

        const wordMap = {};
        batchResults.forEach(r => {
            (r.wordCloud || []).forEach(w => {
                wordMap[w.word] = (wordMap[w.word] || 0) + w.weight;
            });
        });
        const wordCloud = Object.entries(wordMap)
            .map(([word, weight]) => ({ word, weight: Math.min(100, Math.round(weight / batchResults.length)) }))
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 20);

        return {
            sentiment: aggregatedSentiment,
            sentiment_breakdown: aggregatedGranular,
            topTopics,
            topicClusters: mergedClusters.slice(0, 8),
            comments_analyzed: batchResults.flatMap(r => r.comments_analyzed || []),
            alerts: batchResults.flatMap(r => r.alerts || []),
            summary: batchResults[batchResults.length - 1]?.summary || '',
            recommendations: [...new Set(batchResults.flatMap(r => r.recommendations || []))].slice(0, 5),
            suggestedReplies: batchResults.flatMap(r => r.suggestedReplies || []).slice(0, 5),
            wordCloud,
            totalProcessed: allComments.length,
        };
    }

    async analyzeSentimentAndTrends(comments, brand = 'NGR', platform = 'social') {
        if (!comments || comments.length === 0) {
            return this._emptyResult('Sin comentarios para analizar.');
        }

        const normalized = comments.map(c =>
            typeof c === 'string'
                ? { text: c, author: 'unknown', followers: 0, likes: 0 }
                : c
        );

        const prioritized = [
            ...normalized.filter(c => (c.followers || 0) >= HIGH_FOLLOWER_THRESHOLD),
            ...normalized.filter(c => (c.followers || 0) < HIGH_FOLLOWER_THRESHOLD),
        ].slice(0, MAX_COMMENTS);

        if (!this.model) {
            console.warn('[Processor] Sin modelo Gemini — usando fallback.');
            return this._keywordFallback(prioritized);
        }

        const batches = [];
        for (let i = 0; i < prioritized.length; i += BATCH_SIZE) {
            batches.push(prioritized.slice(i, i + BATCH_SIZE));
        }

        console.log(`[Gemini] ${prioritized.length} comentarios → ${batches.length} batch(es) [${brand} / ${platform}]`);

        const batchResults = [];
        for (let i = 0; i < batches.length; i++) {
            try {
                const result = await this._analyzeBatch(batches[i], brand, platform, i + 1, batches.length);
                batchResults.push(result);
            } catch (err) {
                console.error(`[Gemini] ❌ Batch ${i + 1} falló:`, err.message);
            }
        }

        if (batchResults.length === 0) return this._keywordFallback(prioritized);
        return this._aggregateBatchResults(batchResults, prioritized);
    }

    async _analyzeBatch(batch, brand, platform, batchNum, totalBatches) {
        const formattedComments = this._formatCommentsForPrompt(batch);

        const prompt = `Sos un analista experto en Social Listening para la empresa NGR (operadora de ${brand} en Latinoamérica).
Estás analizando comentarios de ${platform.toUpperCase()} sobre la marca "${brand}".
${totalBatches > 1 ? `Batch ${batchNum} de ${totalBatches}.` : ''}

COMENTARIOS:
${formattedComments}

Analizá cada comentario considerando: texto, seguidores del autor (mayor = mayor impacto), y likes recibidos.

Devolvé ÚNICAMENTE este JSON sin markdown:
{
  "sentiment": { "positive": 65, "neutral": 25, "negative": 10 },
  "sentiment_breakdown": { "very_positive": 20, "positive": 45, "neutral": 25, "negative": 8, "very_negative": 2 },
  "topTopics": ["Sabor", "Atención al cliente", "Precios", "Delivery"],
  "topicClusters": [
    { "label": "Calidad de la comida", "count": 5, "sentiment": "positive", "representative_quote": "La hamburguesa es increíble" }
  ],
  "comments_analyzed": [
    {
      "author": "@nombre_cuenta",
      "followers": 4200,
      "impact": "medium",
      "text_preview": "Primeras 60 caracteres...",
      "sentiment": "positive",
      "category": "praise",
      "topics": ["Sabor"],
      "requires_response": false
    }
  ],
  "alerts": [
    { "type": "high_follower_critical", "author": "@cuenta", "followers": 50000, "message": "Critica de alto alcance" }
  ],
  "summary": "Resumen ejecutivo de 2-3 lineas.",
  "recommendations": ["Acción concreta 1", "Acción concreta 2"],
  "suggestedReplies": [
    { "author": "@cuenta", "comment": "texto original", "reply": "Respuesta empática de la marca", "priority": "high" }
  ],
  "wordCloud": [{ "word": "hamburguesa", "weight": 95 }, { "word": "delivery", "weight": 60 }]
}

REGLAS:
- "sentiment" y "sentiment_breakdown" deben sumar exactamente 100 cada uno
- Categorías de "category": "praise" | "complaint" | "question" | "suggestion" | "neutral_mention" | "crisis" | "viral_potential"
- "impact": "high" (>10k seguidores), "medium" (1k-10k), "low" (<1k)
- "requires_response": true solo para quejas directas, preguntas sin respuesta, o críticas de alto impacto
- "alerts": solo cuentas con >5000 seguidores con contenido negativo o viral
- "wordCloud": 15-20 palabras de impacto, weight 10-100, sin preposiciones
- Todo en español
- SOLO JSON.`;

        const result = await this.model.generateContent(prompt);
        const text = result.response.text();
        const clean = text.replace(/```json\n?|```\n?/g, '').trim();
        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error(`Batch ${batchNum}: respuesta no es JSON`);

        const parsed = JSON.parse(jsonMatch[0]);

        // Normalizar si no suma 100
        const sentTotal = (parsed.sentiment?.positive || 0) + (parsed.sentiment?.neutral || 0) + (parsed.sentiment?.negative || 0);
        if (Math.abs(sentTotal - 100) > 5) {
            const factor = 100 / sentTotal;
            parsed.sentiment.positive = Math.round(parsed.sentiment.positive * factor);
            parsed.sentiment.negative = Math.round(parsed.sentiment.negative * factor);
            parsed.sentiment.neutral = 100 - parsed.sentiment.positive - parsed.sentiment.negative;
        }
        return parsed;
    }

    async generateWeeklyExecutiveBriefing(scanSummaries) {
        if (!this.model || !scanSummaries || scanSummaries.length === 0) return null;

        const prompt = `Sos el Chief Strategy Officer de NGR (Bembos, Papa Johns, Popeyes, Dunkin, China Wok - Perú).
Analizá estos datos de la semana y generá un Briefing Ejecutivo para el Directorio.

DATOS:
${JSON.stringify(scanSummaries.slice(0, 20), null, 2)}

SOLO este JSON:
{
  "executiveBrief": "Resumen estratégico 2-3 oraciones. Mencionar mejor y peor marca.",
  "brandPerformance": [
    { "brand": "Bembos", "status": "Growing", "keyFinding": "Hallazgo concreto", "sentiment_delta": "+5%" }
  ],
  "topStrategicRisk": "Mayor riesgo detectado con detalle",
  "opportunities": ["Oportunidad 1", "Oportunidad 2"],
  "nextSteps": ["Acción inmediata", "Acción mediano plazo", "Acción estratégica"],
  "week_label": "Semana del DD/MM al DD/MM"
}

"status" válidos: "Growing" | "Stable" | "At Risk" | "Crisis" | "Recovering"
SOLO JSON.`;

        try {
            const result = await this.model.generateContent(prompt);
            const text = result.response.text();
            const clean = text.replace(/```json\n?|```\n?/g, '').trim();
            const jsonMatch = clean.match(/\{[\s\S]*\}/);
            return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch (e) {
            console.error('[Processor] Weekly Briefing Error:', e.message);
            return null;
        }
    }

    async sendSlackNotification(title, message, color = '#ff53ba') {
        const webhookUrl = process.env.SLACK_WEBHOOK_URL;
        if (!webhookUrl) { console.log(`[SLACK_MOCK] [${title}] ${message}`); return; }
        try {
            const axios = require('axios');
            await axios.post(webhookUrl, { attachments: [{ color, title, text: message }] });
        } catch (e) {
            console.error('[Slack] Error:', e.message);
        }
    }

    _emptyResult(reason = '') {
        return {
            sentiment: { positive: 0, neutral: 100, negative: 0 },
            sentiment_breakdown: { very_positive: 0, positive: 0, neutral: 100, negative: 0, very_negative: 0 },
            topTopics: [], topicClusters: [], comments_analyzed: [], alerts: [],
            summary: reason, recommendations: [], suggestedReplies: [], wordCloud: [], totalProcessed: 0,
        };
    }

    _keywordFallback(comments) {
        const positiveWords = ['rico', 'amo', 'bueno', 'excelente', 'promo', 'gracias', 'lindo', 'perfecto', 'me encanta', 'delicioso', 'genial'];
        const negativeWords = ['malo', 'feo', 'asco', 'pésimo', 'tarda', 'frio', 'caro', 'peor', 'queja', 'horrible', 'demora', 'mal', 'terrible'];
        let pos = 0, neg = 0;
        comments.forEach(c => {
            const low = (c.text || c).toLowerCase();
            if (positiveWords.some(w => low.includes(w))) pos++;
            if (negativeWords.some(w => low.includes(w))) neg++;
        });
        const total = comments.length || 1;
        const posP = Math.round((pos / total) * 100) || 50;
        const negP = Math.round((neg / total) * 100) || 15;
        const neuP = 100 - posP - negP;
        return {
            sentiment: { positive: posP, neutral: neuP, negative: negP },
            sentiment_breakdown: {
                very_positive: Math.round(posP * 0.3), positive: Math.round(posP * 0.7),
                neutral: neuP, negative: Math.round(negP * 0.7), very_negative: Math.round(negP * 0.3),
            },
            topTopics: ['Sabor', 'Precios', 'Delivery', 'Atención', 'Calidad'],
            topicClusters: [],
            comments_analyzed: comments.slice(0, 10).map(c => ({
                author: c.author || 'desconocido', followers: c.followers || 0,
                impact: this._getImpactLabel(c.followers),
                text_preview: (c.text || c).substring(0, 60),
                sentiment: 'neutral', category: 'neutral_mention', topics: [], requires_response: false,
            })),
            alerts: comments.filter(c => (c.followers || 0) >= HIGH_FOLLOWER_THRESHOLD).slice(0, 3).map(c => ({
                type: 'high_follower_unanalyzed', author: c.author, followers: c.followers,
                message: 'Cuenta de alto impacto — Gemini no disponible para análisis completo.',
            })),
            summary: '[Modo fallback] Análisis básico. Verificar GEMINI_API_KEY.',
            recommendations: ['Verificar conexión con Gemini API'],
            suggestedReplies: [],
            wordCloud: [
                { word: 'sabor', weight: 90 }, { word: 'promo', weight: 70 },
                { word: 'delivery', weight: 55 }, { word: 'atención', weight: 45 },
            ],
            totalProcessed: comments.length,
        };
    }
}

module.exports = InsightProcessor;
