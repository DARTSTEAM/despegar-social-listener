/**
 * InsightProcessor — Análisis de comentarios sociales con Gemini Flash
 * 
 * Mejoras v2:
 * - Recibe objetos ricos {text, author, followers, likes}, no solo strings
 * - Batching: procesa de a 25 comentarios y agrega resultados
 * - Análisis por comentario individual (sentiment + categoría)
 * - Sentimiento granular: 5 niveles + tipo de comentario
 * - Peso por influencia (followers)
 * - Alertas automáticas por cuentas de alto impacto
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ─── Constantes ───────────────────────────────────────────────────────────────
const BATCH_SIZE = 25;          // comentarios por llamada a Gemini
const MAX_COMMENTS = 100;       // límite total a procesar
const HIGH_FOLLOWER_THRESHOLD = 5000;  // cuenta con impacto relevante

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

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Calcula peso de un comentario según followers (influencia en redes)
     * Retorna: 'high' (>10k), 'medium' (1k-10k), 'low' (<1k)
     */
    _getImpactLabel(followers = 0) {
        if (followers >= 10000) return 'high';
        if (followers >= 1000) return 'medium';
        return 'low';
    }

    /**
     * Formatea comentarios para el prompt de Gemini — incluye metadata de cuenta
     */
    _formatCommentsForPrompt(comments) {
        return comments.map((c, i) => {
            const impact = this._getImpactLabel(c.followers);
            return `[${i + 1}] @${c.author} (${c.followers?.toLocaleString() ?? 0} seguidores, impacto: ${impact})\n"${c.text}"${c.likes ? ` [${c.likes} likes]` : ''}`;
        }).join('\n\n');
    }

    /**
     * Agrega los resultados de múltiples batches en un único resultado consolidado
     */
    _aggregateBatchResults(batchResults, allComments) {
        if (batchResults.length === 0) return null;
        if (batchResults.length === 1) return batchResults[0];

        const totalComments = allComments.length;

        // Agregar sentimiento ponderado por cantidad de comentarios en cada batch
        const sentimentKeys = ['positive', 'neutral', 'negative'];
        const granularKeys = ['very_positive', 'positive', 'neutral', 'negative', 'very_negative'];
        const aggregatedSentiment = {};
        const aggregatedGranular = {};

        sentimentKeys.forEach(k => {
            const avg = batchResults.reduce((sum, r) => sum + (r.sentiment?.[k] ?? 0), 0) / batchResults.length;
            aggregatedSentiment[k] = Math.round(avg);
        });

        granularKeys.forEach(k => {
            const avg = batchResults.reduce((sum, r) => sum + (r.sentiment_breakdown?.[k] ?? 0), 0) / batchResults.length;
            aggregatedGranular[k] = Math.round(avg);
        });

        // Normalizar para que sumen 100
        const sentTotal = Object.values(aggregatedSentiment).reduce((a, b) => a + b, 0);
        if (sentTotal !== 100) {
            const diff = 100 - sentTotal;
            aggregatedSentiment.neutral = (aggregatedSentiment.neutral || 0) + diff;
        }

        // Unir topTopics y topicClusters de todos los batches
        const allTopics = batchResults.flatMap(r => r.topTopics || []);
        const topTopics = [...new Set(allTopics)].slice(0, 8);

        const allClusters = batchResults.flatMap(r => r.topicClusters || []);
        const mergedClusters = [];
        allClusters.forEach(cluster => {
            const existing = mergedClusters.find(c => c.label.toLowerCase() === cluster.label.toLowerCase());
            if (existing) {
                existing.count += cluster.count;
            } else {
                mergedClusters.push({ ...cluster });
            }
        });
        mergedClusters.sort((a, b) => b.count - a.count);

        // Unir comments_analyzed de todos los batches
        const allAnalyzed = batchResults.flatMap(r => r.comments_analyzed || []);

        // Unir alerts
        const allAlerts = batchResults.flatMap(r => r.alerts || []);

        // Unir wordCloud agrando pesos
        const wordMap = {};
        batchResults.forEach(r => {
            (r.wordCloud || []).forEach(w => {
                if (!wordMap[w.word]) wordMap[w.word] = 0;
                wordMap[w.word] += w.weight;
            });
        });
        const wordCloud = Object.entries(wordMap)
            .map(([word, weight]) => ({ word, weight: Math.min(100, Math.round(weight / batchResults.length)) }))
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 20);

        // Usar el summary del último batch (tiene más contexto acumulado)
        const summary = batchResults[batchResults.length - 1]?.summary || '';

        // Tomar sugerencias de respuesta del batch con comentarios más críticos
        const suggestedReplies = batchResults.flatMap(r => r.suggestedReplies || []).slice(0, 5);
        const recommendations = [...new Set(batchResults.flatMap(r => r.recommendations || []))].slice(0, 5);

        return {
            sentiment: aggregatedSentiment,
            sentiment_breakdown: aggregatedGranular,
            topTopics,
            topicClusters: mergedClusters.slice(0, 8),
            comments_analyzed: allAnalyzed,
            alerts: allAlerts,
            summary,
            recommendations,
            suggestedReplies,
            wordCloud,
            totalProcessed: totalComments,
        };
    }

    // ─── Análisis principal ───────────────────────────────────────────────────

    /**
     * Analiza comentarios de redes sociales con Gemini.
     * @param {Array<{text, author, followers, likes}>} comments - Comentarios normalizados
     * @param {string} brand - Nombre de la marca (ej: 'Bembos')
     * @param {string} platform - Plataforma (ej: 'tiktok', 'instagram')
     */
    async analyzeSentimentAndTrends(comments, brand = 'NGR', platform = 'social') {
        if (!comments || comments.length === 0) {
            return this._emptyResult('Sin comentarios para analizar.');
        }

        // Si recibió strings por compatibilidad, convertirlos a objetos
        const normalized = comments.map(c =>
            typeof c === 'string'
                ? { text: c, author: 'unknown', followers: 0, likes: 0 }
                : c
        );

        // Priorizar comentarios de alto impacto antes de limitar
        const prioritized = [
            ...normalized.filter(c => (c.followers || 0) >= HIGH_FOLLOWER_THRESHOLD),
            ...normalized.filter(c => (c.followers || 0) < HIGH_FOLLOWER_THRESHOLD),
        ].slice(0, MAX_COMMENTS);

        if (!this.model) {
            console.warn('[Processor] Sin modelo Gemini — usando fallback por palabras clave.');
            return this._keywordFallback(prioritized);
        }

        // Dividir en batches
        const batches = [];
        for (let i = 0; i < prioritized.length; i += BATCH_SIZE) {
            batches.push(prioritized.slice(i, i + BATCH_SIZE));
        }

        console.log(`[Gemini] Procesando ${prioritized.length} comentarios en ${batches.length} batch(es) para ${brand} (${platform})`);

        const batchResults = [];
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            console.log(`[Gemini] Batch ${i + 1}/${batches.length} — ${batch.length} comentarios`);
            try {
                const result = await this._analyzeBatch(batch, brand, platform, i + 1, batches.length);
                batchResults.push(result);
            } catch (err) {
                console.error(`[Gemini] Error en batch ${i + 1}:`, err.message);
                // Continuar con los demás batches aunque uno falle
            }
        }

        if (batchResults.length === 0) {
            console.warn('[Processor] Todos los batches fallaron. Usando fallback.');
            return this._keywordFallback(prioritized);
        }

        return this._aggregateBatchResults(batchResults, prioritized);
    }

    /**
     * Analiza un batch de hasta 25 comentarios con Gemini
     */
    async _analyzeBatch(batch, brand, platform, batchNum, totalBatches) {
        const formattedComments = this._formatCommentsForPrompt(batch);

        const prompt = `Eres un analista experto en Social Listening para la empresa NGR (operadora de ${brand} en Latinoamérica).
Estás analizando comentarios de ${platform.toUpperCase()} sobre la marca "${brand}".
${totalBatches > 1 ? `Este es el batch ${batchNum} de ${totalBatches}.` : ''}

COMENTARIOS A ANALIZAR:
${formattedComments}

Analizá cada comentario teniendo en cuenta:
- El texto del comentario
- La cantidad de seguidores del autor (mayor = mayor impacto en la marca)
- Los likes recibidos

Devolvé ÚNICAMENTE un JSON con esta estructura exacta. Sin markdown, sin texto extra:
{
  "sentiment": {
    "positive": 65,
    "neutral": 25,
    "negative": 10
  },
  "sentiment_breakdown": {
    "very_positive": 20,
    "positive": 45,
    "neutral": 25,
    "negative": 8,
    "very_negative": 2
  },
  "topTopics": ["Sabor", "Atención al cliente", "Precios", "Delivery", "Ambiente"],
  "topicClusters": [
    {
      "label": "Calidad de la comida",
      "count": 8,
      "sentiment": "positive",
      "representative_quote": "La hamburguesa Carretillera es increíble"
    },
    {
      "label": "Tiempo de espera",
      "count": 3,
      "sentiment": "negative",
      "representative_quote": "Esperé 40 minutos y la comida llegó fría"
    }
  ],
  "comments_analyzed": [
    {
      "author": "@nombre_cuenta",
      "followers": 4200,
      "impact": "medium",
      "text_preview": "Primeras 60 caracteres del comentario...",
      "sentiment": "positive",
      "category": "praise",
      "topics": ["Sabor", "Calidad"],
      "requires_response": false
    }
  ],
  "alerts": [
    {
      "type": "high_follower_critical",
      "author": "@cuenta_grande",
      "followers": 50000,
      "message": "Account con alto alcance publicó critica negativa sobre delivery"
    }
  ],
  "summary": "Resumen ejecutivo de 2-3 lineas sobre el panorama general de los comentarios analizados",
  "recommendations": [
    "Acción concreta recomendada 1",
    "Acción concreta recomendada 2"
  ],
  "suggestedReplies": [
    {
      "author": "@cuenta",
      "comment": "texto original del comentario negativo o pregunta",
      "reply": "Respuesta profesional y empática de la marca",
      "priority": "high"
    }
  ],
  "wordCloud": [
    {"word": "hamburguesa", "weight": 95},
    {"word": "delivery", "weight": 60},
    {"word": "atención", "weight": 45}
  ]
}

REGLAS IMPORTANTES:
- "sentiment" debe sumar exactamente 100
- "sentiment_breakdown" debe sumar exactamente 100
- Categorías válidas para "category": "praise" | "complaint" | "question" | "suggestion" | "neutral_mention" | "crisis" | "viral_potential"
- "impact" según seguidores: "high" (>10k), "medium" (1k-10k), "low" (<1k)
- "requires_response": true solo si es queja directa, pregunta sin respuesta, o crítica de impacto alto
- Incluir en "alerts" SOLO cuentas con >5000 followers que postean algo negativo o con alto potencial viral
- "wordCloud": 15-20 palabras clave de mayor impacto, weight de 10 a 100, excluir preposiciones
- Todos los textos en español
- SOLO JSON. Sin explicaciones.`;

        const result = await this.model.generateContent(prompt);
        const text = result.response.text();
        const clean = text.replace(/```json\n?|```\n?/g, '').trim();

        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error(`Batch ${batchNum}: respuesta no es JSON válido`);

        const parsed = JSON.parse(jsonMatch[0]);

        // Validar que los sentimientos sumen 100
        const sentTotal = (parsed.sentiment?.positive || 0) + (parsed.sentiment?.neutral || 0) + (parsed.sentiment?.negative || 0);
        if (Math.abs(sentTotal - 100) > 5) {
            console.warn(`[Gemini] Batch ${batchNum}: sentimiento suma ${sentTotal}, normalizando.`);
            const factor = 100 / sentTotal;
            parsed.sentiment.positive = Math.round(parsed.sentiment.positive * factor);
            parsed.sentiment.negative = Math.round(parsed.sentiment.negative * factor);
            parsed.sentiment.neutral = 100 - parsed.sentiment.positive - parsed.sentiment.negative;
        }

        return parsed;
    }

    // ─── Reporte Ejecutivo Semanal ────────────────────────────────────────────

    async generateWeeklyExecutiveBriefing(scanSummaries) {
        if (!this.model || !scanSummaries || scanSummaries.length === 0) return null;

        const prompt = `Sos el Chief Strategy Officer de NGR (operadora de Bembos, Papa Johns, Popeyes, Dunkin, China Wok en Perú).
Analizá estos datos de la semana y generá un "Briefing Ejecutivo Semanal" para el Directorio.

DATOS DE LA SEMANA:
${JSON.stringify(scanSummaries.slice(0, 20), null, 2)}

Devolvé ÚNICAMENTE este JSON:
{
  "executiveBrief": "Resumen estratégico en 2-3 oraciones. Mencionar la marca con mejor y peor semana.",
  "brandPerformance": [
    {
      "brand": "Bembos",
      "status": "Growing",
      "keyFinding": "Hallazgo principal concreto y accionable",
      "sentiment_delta": "+5%"
    }
  ],
  "topStrategicRisk": "El mayor riesgo detectado esta semana con detalle",
  "opportunities": ["Oportunidad detectada 1", "Oportunidad detectada 2"],
  "nextSteps": ["Acción inmediata 1", "Acción a mediano plazo 2", "Acción estratégica 3"],
  "week_label": "Semana del DD/MM al DD/MM"
}

REGLAS:
- "status" válidos: "Growing" | "Stable" | "At Risk" | "Crisis" | "Recovering"
- Ser específico con nombres de marcas y datos concretos
- SOLO JSON. Sin markdown.`;

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

    // ─── Slack ────────────────────────────────────────────────────────────────

    async sendSlackNotification(title, message, color = '#ff53ba') {
        const webhookUrl = process.env.SLACK_WEBHOOK_URL;
        if (!webhookUrl) {
            console.log(`[SLACK_MOCK] [${title}] ${message}`);
            return;
        }
        try {
            const axios = require('axios');
            await axios.post(webhookUrl, {
                attachments: [{ color, title, text: message }]
            });
        } catch (e) {
            console.error('[Slack] Error:', e.message);
        }
    }

    // ─── Fallbacks ────────────────────────────────────────────────────────────

    _emptyResult(reason = '') {
        return {
            sentiment: { positive: 0, neutral: 100, negative: 0 },
            sentiment_breakdown: { very_positive: 0, positive: 0, neutral: 100, negative: 0, very_negative: 0 },
            topTopics: [],
            topicClusters: [],
            comments_analyzed: [],
            alerts: [],
            summary: reason,
            recommendations: [],
            suggestedReplies: [],
            wordCloud: [],
            totalProcessed: 0,
        };
    }

    _keywordFallback(comments) {
        const positiveWords = ['rico', 'amo', 'bueno', 'excelente', 'promo', 'gracias', 'lindo', 'perfecto', 'me encanta', 'delicioso', 'increíble', 'genial'];
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
                very_positive: Math.round(posP * 0.3),
                positive: Math.round(posP * 0.7),
                neutral: neuP,
                negative: Math.round(negP * 0.7),
                very_negative: Math.round(negP * 0.3),
            },
            topTopics: ['Sabor', 'Precios', 'Delivery', 'Atención', 'Calidad'],
            topicClusters: [],
            comments_analyzed: comments.slice(0, 10).map(c => ({
                author: c.author || 'desconocido',
                followers: c.followers || 0,
                impact: this._getImpactLabel(c.followers),
                text_preview: (c.text || c).substring(0, 60),
                sentiment: 'neutral',
                category: 'neutral_mention',
                topics: [],
                requires_response: false,
            })),
            alerts: comments
                .filter(c => (c.followers || 0) >= HIGH_FOLLOWER_THRESHOLD)
                .slice(0, 3)
                .map(c => ({
                    type: 'high_follower_unanalyzed',
                    author: c.author,
                    followers: c.followers,
                    message: `Cuenta de alto impacto detectada (Gemini no disponible para análisis completo).`,
                })),
            summary: '[Modo fallback] Análisis básico por palabras clave. Gemini no disponible.',
            recommendations: ['Verificar conexión con Gemini API', 'Revisar GEMINI_API_KEY'],
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
