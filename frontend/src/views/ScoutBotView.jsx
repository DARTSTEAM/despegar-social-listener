import { motion } from 'framer-motion';
import SentimentPill from '../components/SentimentPill';

const categoryLabel = {
  praise: '★ Elogio', complaint: '⚠ Queja', question: '? Pregunta',
  suggestion: '→ Sugerencia', neutral_mention: '· Mención', crisis: '🔴 Crisis', viral_potential: '⚡ Viral',
};
const sentimentDot = (s) => {
  if (s === 'very_positive') return 'bg-accent-lemon shadow-[0_0_8px_rgba(152,255,188,0.6)]';
  if (s === 'positive') return 'bg-accent-lemon/60';
  if (s === 'negative') return 'bg-accent-pink/70';
  if (s === 'very_negative') return 'bg-accent-pink shadow-[0_0_8px_rgba(255,83,186,0.6)]';
  return 'bg-fg/20';
};

const ScoutBotView = ({ platform, setPlatform, url, setUrl, handleScout, isScraping, insights, scrapedData, error }) => {
  // Guardia: siempre arrays seguros
  const analyzedComments = Array.isArray(insights?.comments_analyzed) ? insights.comments_analyzed : [];
  const rawComments = Array.isArray(scrapedData) ? scrapedData : [];
  const displayComments = analyzedComments.length > 0
    ? analyzedComments
    : rawComments.map(c => ({ ...c, text_preview: c.text?.substring(0, 80) }));

  return (
    <section className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <p className="text-xs font-bold text-fg/20 uppercase tracking-widest mb-2">Social Listening Agent</p>
          <h1 className="pwa-title text-fg leading-tight">Scout Bot <br /><span className="text-accent-orange">Extractor</span></h1>
        </div>
        <div className="flex flex-col flex-1 max-w-md gap-4">
          <div className="flex gap-2">
            {['tiktok', 'instagram', 'google-maps', 'facebook'].map(p => (
              <button key={p} onClick={() => setPlatform(p)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${platform === p ? 'bg-accent-orange border-accent-orange text-white' : 'bg-fg/5 border-fg/10 text-fg/40'}`}>
                {p}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="pwa-card bg-fg/5 border-fg/10 px-4 py-2 text-xs flex-1 outline-none focus:border-accent-orange text-fg"
              placeholder={`URL de ${platform}...`} value={url} onChange={(e) => setUrl(e.target.value)}
            />
            <button onClick={handleScout} disabled={isScraping} className="pwa-btn px-6 py-2 text-white">
              {isScraping ? 'Analizando...' : 'Escanear'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <span className="text-[9px] font-black uppercase text-fg/20 w-full mb-1">Quick Connect — Empresas NGR</span>
            {(platform === 'tiktok' ? [
              { label: 'Bembos', url: 'https://www.tiktok.com/@bembos_peru' },
              { label: 'Papa Johns', url: 'https://www.tiktok.com/@papajohns_peru' },
            ] : platform === 'instagram' ? [
              { label: 'Popeyes', url: 'https://www.instagram.com/popeyesperu/' },
              { label: 'Dunkin', url: 'https://www.instagram.com/dunkin_peru/' },
            ] : platform === 'google-maps' ? [
              { label: 'Bembos Surco', url: 'https://www.google.com/maps/search/bembos+surco' },
            ] : []).map(link => (
              <button key={link.label} onClick={() => { setUrl(link.url); setPlatform(platform); }}
                className="px-3 py-1 bg-fg/5 border border-fg/10 rounded-full text-[8px] font-black uppercase tracking-widest text-fg/40 hover:text-accent-orange hover:border-accent-orange transition-all">
                {link.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error && (
        <div className="pwa-card p-4 border-accent-pink/50 bg-accent-pink/10 text-accent-pink text-[10px] font-black italic uppercase tracking-widest">
          ⚠ {error}
        </div>
      )}

      {insights && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-8 pwa-card p-8 bg-gradient-to-br from-accent-orange/10 to-transparent border-accent-orange/20 space-y-8">

            {/* Resumen ejecutivo */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="px-3 py-1 bg-accent-orange text-white font-black text-[10px] uppercase italic rounded-full">AI Insight</div>
                <h2 className="text-xl font-black italic uppercase tracking-tighter text-fg">Resumen Ejecutivo</h2>
                {insights.totalProcessed > 0 && (
                  <span className="text-[9px] font-black uppercase text-fg/30">{insights.totalProcessed} comentarios analizados</span>
                )}
              </div>
              <p className="text-lg font-bold text-fg/90 leading-relaxed italic">"{insights.summary}"</p>
              <div className="flex flex-row gap-3">
                <SentimentPill type="positive" count={`${insights.sentiment?.positive || 0}%`} />
                <SentimentPill type="negative" count={`${insights.sentiment?.negative || 0}%`} />
              </div>
            </div>

            {/* Sentiment breakdown 5 niveles */}
            {insights.sentiment_breakdown && (
              <div className="space-y-3 border-t border-fg/5 pt-6">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-fg/30">Sentiment Breakdown — 5 Niveles</h3>
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { k: 'very_positive', label: 'Muy Pos.', color: 'bg-accent-lemon' },
                    { k: 'positive', label: 'Positivo', color: 'bg-accent-lemon/50' },
                    { k: 'neutral', label: 'Neutral', color: 'bg-fg/20' },
                    { k: 'negative', label: 'Negativo', color: 'bg-accent-pink/50' },
                    { k: 'very_negative', label: 'Muy Neg.', color: 'bg-accent-pink' },
                  ].map(({ k, label, color }) => (
                    <div key={k} className="text-center space-y-2">
                      <div className={`text-sm font-black ${insights.sentiment_breakdown[k] > 0 ? 'text-fg' : 'text-fg/20'}`}>
                        {insights.sentiment_breakdown[k] || 0}%
                      </div>
                      <div className="h-1 bg-fg/5 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${insights.sentiment_breakdown[k] || 0}%` }}
                          transition={{ duration: 0.8 }}
                          className={`h-full ${color}`}
                        />
                      </div>
                      <p className="text-[8px] font-black uppercase text-fg/20">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Topic clusters */}
            {insights.topicClusters?.length > 0 && (
              <div className="space-y-4 border-t border-fg/5 pt-6">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-fg/30">Topic Clusters</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {insights.topicClusters.map((cluster, i) => (
                    <div key={i} className="p-4 bg-fg/5 rounded-xl border border-fg/5 flex justify-between items-start hover:bg-fg/10 transition-all">
                      <div>
                        <p className="text-sm font-bold italic tracking-tight text-fg">{cluster.label}</p>
                        <p className="text-[9px] font-medium uppercase text-fg/20 mt-0.5">{cluster.count} menciones</p>
                        {cluster.representative_quote && (
                          <p className="text-[9px] text-fg/30 italic mt-1">"{cluster.representative_quote.substring(0, 55)}..."</p>
                        )}
                      </div>
                      <div className={`w-2 h-2 rounded-full shrink-0 mt-1 ${cluster.sentiment === 'negative' ? 'bg-accent-pink shadow-[0_0_10px_rgba(255,83,186,0.5)]' : 'bg-accent-lemon'}`} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recomendaciones */}
            {insights.recommendations?.length > 0 && (
              <div className="space-y-3 border-t border-fg/5 pt-6">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-fg/30">Recomendaciones</h3>
                <div className="space-y-2">
                  {insights.recommendations.map((r, i) => (
                    <p key={i} className="text-xs font-bold text-fg/60 flex items-start gap-2">
                      <span className="text-accent-lemon shrink-0">→</span>{r}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </motion.div>

          {/* AI Responder */}
          <div className="lg:col-span-4 pwa-card p-6 bg-accent-lemon/5 border-accent-lemon/10 space-y-4">
            <h3 className="font-black italic uppercase text-xs tracking-widest text-accent-lemon">AI Responder</h3>
            {insights.suggestedReplies?.length > 0 ? insights.suggestedReplies.map((r, i) => (
              <div key={i} className="p-3 bg-fg/5 rounded-lg text-xs space-y-2 border border-fg/5">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-black uppercase text-accent-orange">@{r.author}</p>
                  {r.priority === 'high' && (
                    <span className="text-[7px] font-black uppercase px-1.5 py-0.5 bg-accent-pink/20 text-accent-pink border border-accent-pink/20 rounded">
                      ⚡ Urgente
                    </span>
                  )}
                </div>
                <p className="opacity-40 italic">"{r.comment?.substring(0, 80)}"</p>
                <p className="font-bold text-fg/80">↳ "{r.reply}"</p>
              </div>
            )) : (
              <p className="text-[9px] text-fg/20 italic">Sin respuestas sugeridas para este scan.</p>
            )}
          </div>
        </div>
      )}

      {/* Lista de comentarios con análisis individual */}
      {displayComments.length > 0 && (
        <div className="space-y-4 mt-8">
          <h3 className="text-xs font-black italic uppercase tracking-widest text-fg/40">
            Comentarios Analizados
            <span className="ml-2 text-fg/20 normal-case font-medium">— {displayComments.length} total</span>
          </h3>
          <div className="grid gap-3">
            {displayComments.map((c, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.4) }}
                className="pwa-card p-4 flex gap-4 items-start hover:bg-fg/[0.04] transition-all"
              >
                <div className={`w-2 h-2 rounded-full shrink-0 mt-2 ${sentimentDot(c.sentiment)}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <p className="text-[10px] font-black uppercase text-accent-orange">@{c.author}</p>
                    {(c.followers || 0) >= 1000 && (
                      <span className="px-2 py-0.5 bg-accent-lemon/20 text-accent-lemon text-[7px] font-black uppercase rounded border border-accent-lemon/20">
                        {(c.followers / 1000).toFixed(1)}k seguidores
                      </span>
                    )}
                    {c.impact === 'high' && (
                      <span className="px-2 py-0.5 bg-accent-pink/20 text-accent-pink text-[7px] font-black uppercase rounded border border-accent-pink/20">
                        Alto impacto
                      </span>
                    )}
                    {c.category && (
                      <span className="text-[7px] font-black uppercase text-fg/30 px-2 py-0.5 bg-fg/5 rounded border border-fg/5">
                        {categoryLabel[c.category] || c.category}
                      </span>
                    )}
                    {c.requires_response && (
                      <span className="text-[7px] font-black uppercase px-2 py-0.5 bg-accent-orange/20 text-accent-orange rounded border border-accent-orange/20">
                        ✱ Requiere respuesta
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-fg/80">{c.text_preview || c.text}</p>
                  {c.topics?.length > 0 && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {c.topics.map((t, ti) => (
                        <span key={ti} className="text-[7px] font-black uppercase text-fg/30 px-1.5 py-0.5 bg-fg/5 rounded">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default ScoutBotView;
