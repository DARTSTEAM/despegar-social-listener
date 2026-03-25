import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Zap } from 'lucide-react';
import SentimentPill from '../components/SentimentPill';

// ─── Lista maestra de cuentas — igual que SettingsView ────────────────────────
const ALL_TARGETS = [
  { key: 'Despegar:tiktok',        brand: 'Despegar',      platform: 'tiktok',    handle: '@despegar',          type: 'Owned',      url: 'https://www.tiktok.com/@despegar' },
  { key: 'Despegar:instagram',     brand: 'Despegar',      platform: 'instagram', handle: '@despegar',          type: 'Owned',      url: 'https://www.instagram.com/despegar/' },
  { key: 'Despegar AR:instagram',  brand: 'Despegar AR',   platform: 'instagram', handle: '@despegar.ar',       type: 'Owned',      url: 'https://www.instagram.com/despegar.ar/' },
  { key: 'Turismo City:instagram', brand: 'Turismo City',  platform: 'instagram', handle: '@turismocity_ar',    type: 'Competitor', url: 'https://www.instagram.com/turismocity_ar/' },
  { key: 'Turismo City:tiktok',    brand: 'Turismo City',  platform: 'tiktok',    handle: '@turismocity',       type: 'Competitor', url: 'https://www.tiktok.com/@turismocity' },
  { key: 'Booking:instagram',      brand: 'Booking',       platform: 'instagram', handle: '@bookingcom',        type: 'Competitor', url: 'https://www.instagram.com/bookingcom/' },
  { key: 'Booking:tiktok',         brand: 'Booking',       platform: 'tiktok',    handle: '@bookingcom',        type: 'Competitor', url: 'https://www.tiktok.com/@bookingcom' },
  { key: 'Airbnb:instagram',       brand: 'Airbnb',        platform: 'instagram', handle: '@airbnb',            type: 'Competitor', url: 'https://www.instagram.com/airbnb/' },
  { key: 'Airbnb:tiktok',          brand: 'Airbnb',        platform: 'tiktok',    handle: '@airbnb',            type: 'Competitor', url: 'https://www.tiktok.com/@airbnb' },
];

const PLATFORM_COLORS = {
  tiktok:    { active: 'bg-white/10 border-white/30 text-white',    idle: 'bg-fg/5 border-fg/10 text-fg/40' },
  instagram: { active: 'bg-accent-pink/20 border-accent-pink/50 text-accent-pink', idle: 'bg-fg/5 border-fg/10 text-fg/40' },
};

const categoryLabel = {
  praise: '★ Elogio', complaint: '⚠ Queja', question: '? Pregunta',
  suggestion: '→ Sugerencia', neutral_mention: '· Mención', crisis: '🔴 Crisis', viral_potential: '⚡ Viral',
};

const sentimentDot = (s) => {
  if (s === 'very_positive') return 'bg-accent-lemon shadow-[0_0_8px_rgba(152,255,188,0.6)]';
  if (s === 'positive')      return 'bg-accent-lemon/60';
  if (s === 'negative')      return 'bg-accent-pink/70';
  if (s === 'very_negative') return 'bg-accent-pink shadow-[0_0_8px_rgba(255,83,186,0.6)]';
  return 'bg-fg/20';
};

const ScoutBotView = ({ platform, setPlatform, url, setUrl, handleScout, isScraping, insights, scrapedData, error }) => {
  const [selectedKey, setSelectedKey] = useState(null);

  // Filtrar targets por plataforma seleccionada
  const visibleTargets = ALL_TARGETS.filter(t => t.platform === platform);

  const handleSelect = (target) => {
    setSelectedKey(target.key);
    setUrl(target.url);
    setPlatform(target.platform);
  };

  const handlePlatformSwitch = (p) => {
    setPlatform(p);
    setSelectedKey(null);
    setUrl('');
  };

  // Datos para mostrar
  const analyzedComments = Array.isArray(insights?.comments_analyzed) ? insights.comments_analyzed : [];
  const rawComments      = Array.isArray(scrapedData) ? scrapedData : [];
  const displayComments  = analyzedComments.length > 0
    ? analyzedComments
    : rawComments.map(c => ({ ...c, text_preview: c.text?.substring(0, 80) }));

  const selectedTarget = ALL_TARGETS.find(t => t.key === selectedKey);

  return (
    <section className="space-y-8 pb-20">

      {/* ── Header ── */}
      <div>
        <p className="text-xs font-bold text-fg/20 uppercase tracking-widest mb-2">Social Listening Agent</p>
        <h1 className="pwa-title text-fg leading-tight">
          Scout Bot <br />
          <span className="text-accent-orange">Extractor</span>
        </h1>
        <p className="text-xs text-fg/30 font-medium mt-3 leading-relaxed">
          Seleccioná una cuenta y plataforma para hacer un análisis profundo en tiempo real,
          usando el mismo motor de scraping que el escaneo masivo.
        </p>
      </div>

      {/* ── Selector de plataforma ── */}
      <div className="flex gap-3">
        {['tiktok', 'instagram'].map(p => (
          <button
            key={p}
            onClick={() => handlePlatformSwitch(p)}
            className={`px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest border transition-all ${
              platform === p
                ? (PLATFORM_COLORS[p]?.active || 'bg-accent-orange border-accent-orange text-white')
                : 'bg-fg/5 border-fg/10 text-fg/40 hover:border-fg/20'
            }`}
          >
            {p === 'tiktok' ? '⬛ TikTok' : '🟣 Instagram'}
          </button>
        ))}
      </div>

      {/* ── Grid de cuentas seleccionables ── */}
      <div>
        <p className="text-[11px] font-black uppercase tracking-widest text-fg/30 mb-4">
          Seleccioná una cuenta para escanear
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {visibleTargets.map(target => {
            const isSelected = selectedKey === target.key;
            return (
              <button
                key={target.key}
                onClick={() => handleSelect(target)}
                className={`text-left px-3 py-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'bg-accent-orange/10 border-accent-orange/50 shadow-md shadow-accent-orange/10 scale-[1.02]'
                    : 'bg-fg/[0.02] border-fg/5 hover:bg-fg/[0.05] hover:border-fg/10'
                }`}
              >
                <div className="min-w-0">
                  <p className={`text-[11px] font-black uppercase italic tracking-tight truncate ${isSelected ? 'text-accent-orange' : 'text-fg'}`}>
                    {target.brand}
                  </p>
                  <p className="text-[9px] font-medium text-fg/30 truncate">{target.handle}</p>
                </div>
                <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 ${
                  target.type === 'Owned'
                    ? 'bg-accent-lemon/10 text-accent-lemon border border-accent-lemon/20'
                    : 'bg-fg/5 text-fg/30 border border-fg/10'
                }`}>
                  {target.type === 'Owned' ? 'Own' : 'Comp'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Panel de acción con cuenta seleccionada ── */}
      {selectedTarget && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="pwa-card p-6 border-accent-orange/20 bg-accent-orange/5 flex flex-col sm:flex-row sm:items-center gap-4"
        >
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-accent-orange mb-1">Cuenta seleccionada</p>
            <p className="text-sm font-black italic text-fg">{selectedTarget.brand} — {selectedTarget.handle}</p>
            <p className="text-[10px] text-fg/30 font-medium mt-0.5 truncate">{selectedTarget.url}</p>
          </div>
          <button
            onClick={handleScout}
            disabled={isScraping}
            className={`shrink-0 flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs uppercase italic tracking-widest transition-all ${
              isScraping
                ? 'bg-fg/10 text-fg/30 cursor-not-allowed'
                : 'bg-accent-orange text-white hover:scale-105 shadow-lg shadow-accent-orange/30'
            }`}
          >
            {isScraping ? (
              <>
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analizando...
              </>
            ) : (
              <>
                <Zap size={14} />
                Escanear cuenta
              </>
            )}
          </button>
        </motion.div>
      )}

      {/* ── Estado: procesando ── */}
      {isScraping && (
        <div className="pwa-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-accent-orange rounded-full animate-pulse shadow-[0_0_8px_rgba(255,149,0,0.5)]" />
            <p className="text-[11px] font-black uppercase tracking-widest text-accent-orange">Scraping en progreso</p>
          </div>
          <div className="space-y-3 text-[11px] font-medium text-fg/40">
            <p>Paso 1 — Obteniendo últimos posts de <span className="text-fg/60">{selectedTarget?.handle}</span>...</p>
            <p className="opacity-50">Paso 2 — Extrayendo comentarios con comment scraper</p>
            <p className="opacity-30">Paso 3 — Análisis con Gemini AI</p>
          </div>
          <div className="h-1 w-full bg-fg/5 rounded-full overflow-hidden">
            <div className="h-full bg-accent-orange rounded-full animate-pulse w-1/3" />
          </div>
          <p className="text-[10px] text-fg/20 italic">Este proceso puede tardar 2–4 minutos dependiendo del volumen.</p>
        </div>
      )}

      {/* ── Error ── */}
      {error && !isScraping && (
        <div className="pwa-card p-4 border-accent-pink/50 bg-accent-pink/10">
          <p className="text-accent-pink text-[11px] font-black italic uppercase tracking-widest">⚠ {error}</p>
        </div>
      )}

      {/* ── Resultados ── */}
      {insights && !isScraping && (
        <div className="space-y-8">

          {/* Header de resultados */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="px-3 py-1 bg-accent-lemon text-black font-black text-[10px] uppercase italic rounded-full">
              Análisis Completo
            </div>
            <p className="text-[11px] font-black uppercase text-fg/30">
              {selectedTarget?.brand} · {selectedTarget?.handle}
            </p>
            {insights.totalProcessed > 0 && (
              <p className="text-[11px] font-black uppercase text-fg/20">
                {insights.totalProcessed} comentarios procesados
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="lg:col-span-8 pwa-card p-8 bg-gradient-to-br from-accent-orange/10 to-transparent border-accent-orange/20 space-y-8"
            >
              {/* Resumen ejecutivo */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="px-3 py-1 bg-accent-orange text-white font-black text-[10px] uppercase italic rounded-full">AI Insight</div>
                  <h2 className="text-xl font-black italic uppercase tracking-tighter text-fg">Resumen Ejecutivo</h2>
                </div>
                <p className="text-lg font-bold text-fg/90 leading-relaxed italic">"{insights.summary}"</p>
                <div className="flex flex-row gap-3">
                  <SentimentPill type="positive" count={`${insights.sentiment?.positive || 0}%`} />
                  <SentimentPill type="negative" count={`${insights.sentiment?.negative || 0}%`} />
                </div>
              </div>

              {/* Sentiment breakdown */}
              {insights.sentiment_breakdown && (
                <div className="space-y-3 border-t border-fg/5 pt-6">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-fg/30">Sentiment Breakdown — 5 Niveles</h3>
                  <div className="grid grid-cols-5 gap-3">
                    {[
                      { k: 'very_positive', label: 'Muy Pos.',  color: 'bg-accent-lemon' },
                      { k: 'positive',      label: 'Positivo',  color: 'bg-accent-lemon/50' },
                      { k: 'neutral',       label: 'Neutral',   color: 'bg-fg/20' },
                      { k: 'negative',      label: 'Negativo',  color: 'bg-accent-pink/50' },
                      { k: 'very_negative', label: 'Muy Neg.',  color: 'bg-accent-pink' },
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
                        <p className="text-[10px] font-black uppercase text-fg/20">{label}</p>
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
                          <p className="text-[11px] font-medium uppercase text-fg/20 mt-0.5">{cluster.count} menciones</p>
                          {cluster.representative_quote && (
                            <p className="text-[11px] text-fg/30 italic mt-1">"{cluster.representative_quote.substring(0, 55)}..."</p>
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
                    <p className="text-[11px] font-black uppercase text-accent-orange">@{r.author}</p>
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
                <p className="text-[11px] text-fg/20 italic">Sin respuestas sugeridas para este scan.</p>
              )}
            </div>
          </div>

          {/* Comentarios individuales */}
          {displayComments.length > 0 && (
            <div className="space-y-4">
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
        </div>
      )}

      {/* Estado vacío — no hay cuenta seleccionada ni resultados */}
      {!selectedKey && !insights && !isScraping && (
        <div className="pwa-card p-12 flex flex-col items-center justify-center text-center space-y-4 border-dashed">
          <div className="w-14 h-14 rounded-full bg-fg/5 flex items-center justify-center">
            <Search size={24} className="text-fg/20" />
          </div>
          <p className="text-sm font-black italic uppercase text-fg/20">Seleccioná una cuenta arriba</p>
          <p className="text-xs text-fg/10 font-medium max-w-xs">
            El análisis usará el mismo motor que el escaneo masivo: extrae los últimos posts y analiza sus comentarios con IA.
          </p>
        </div>
      )}
    </section>
  );
};

export default ScoutBotView;
