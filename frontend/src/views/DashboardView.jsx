import { motion } from 'framer-motion';
import MetricCard from '../components/MetricCard';
import ShareOfVoiceChart from '../components/ShareOfVoiceChart';
import CyberWordCloud from '../components/CyberWordCloud';
import { BarChart3, MessageSquare, AlertTriangle, Users, TrendingUp, Zap, ChevronRight, Star } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getWeekLabel = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
  return `Semana ${String(week).padStart(2, '0')} / ${now.getFullYear()}`;
};

const sentimentColor = (s) => {
  if (s === 'very_positive' || s === 'positive') return 'text-accent-lemon';
  if (s === 'very_negative' || s === 'negative') return 'text-accent-pink';
  return 'text-fg/40';
};

const sentimentDot = (s) => {
  if (s === 'very_positive') return 'bg-accent-lemon shadow-[0_0_8px_rgba(152,255,188,0.6)]';
  if (s === 'positive') return 'bg-accent-lemon/60';
  if (s === 'negative') return 'bg-accent-pink/70';
  if (s === 'very_negative') return 'bg-accent-pink shadow-[0_0_8px_rgba(255,83,186,0.6)]';
  return 'bg-fg/20';
};

const categoryLabel = {
  praise: '★ Elogio',
  complaint: '⚠ Queja',
  question: '? Pregunta',
  suggestion: '→ Sugerencia',
  neutral_mention: '· Mención',
  crisis: '🔴 Crisis',
  viral_potential: '⚡ Viral',
};

const impactBadge = {
  high: { label: 'Alto alcance', cls: 'bg-accent-pink/20 text-accent-pink border-accent-pink/30' },
  medium: { label: 'Medio alcance', cls: 'bg-accent-orange/20 text-accent-orange border-accent-orange/30' },
  low: { label: 'Bajo alcance', cls: 'bg-fg/10 text-fg/40 border-fg/10' },
};

// ─── Subcomponents ────────────────────────────────────────────────────────────

const SentimentBar = ({ label, value, color }) => (
  <div className="space-y-1.5">
    <div className="flex justify-between items-center">
      <span className="text-[11px] font-black uppercase tracking-widest text-fg/30">{label}</span>
      <span className={`text-[10px] font-black ${color}`}>{value}%</span>
    </div>
    <div className="h-1 w-full bg-fg/5 rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className={`h-full rounded-full ${color === 'text-accent-lemon' ? 'bg-accent-lemon' : color === 'text-accent-pink' ? 'bg-accent-pink' : 'bg-fg/20'}`}
      />
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const DashboardView = ({ history: rawHistory, alerts: rawAlerts, report }) => {

  // ── Guardia: normalizar siempre a arrays ──────────────────────────────────
  const history = Array.isArray(rawHistory) ? rawHistory : [];
  const alerts  = Array.isArray(rawAlerts)  ? rawAlerts  : [];

  // ── Constante de marcas propias ───────────────────────────────────────────
  const OWNED_BRANDS = ['Despegar', 'Despegar AR'];

  // ── Separar historial en owned vs competencia ──────────────────────────────
  const ownedHistory = history.filter(h => OWNED_BRANDS.includes(h.brand));
  const compHistory  = history.filter(h => !OWNED_BRANDS.includes(h.brand));

  // ── Stats por grupo ────────────────────────────────────────────────────────
  const groupStats = (group) => {
    if (!group.length) return { comments: 0, pos: 0, neg: 0, neu: 0, brands: [] };
    const comments = group.reduce((a, h) => a + (h.commentsCount || 0), 0);
    const pos = Math.round(group.reduce((a, h) => a + (h.sentiment?.positive || 0), 0) / group.length);
    const neg = Math.round(group.reduce((a, h) => a + (h.sentiment?.negative || 0), 0) / group.length);
    const neu = Math.round(group.reduce((a, h) => a + (h.sentiment?.neutral  || 0), 0) / group.length);
    const brands = [...new Set(group.map(h => h.brand))];
    return { comments, pos, neg, neu, brands };
  };
  const ownedStats = groupStats(ownedHistory);
  const compStats  = groupStats(compHistory);

  // ── Alertas reales de Gemini (de todos los scans) + alertas del backend ────
  const geminiAlerts = history.flatMap(h => h.alerts || []);
  const allAlerts = [...alerts, ...geminiAlerts];

  // ── Share of Voice por grupo ───────────────────────────────────────────────
  const getSOV = (group) => {
    if (!group.length) return [];
    const brands = {};
    const colors = ['#9B72F5', '#98FFBC', '#FF53BA', '#0070f3', '#ccff00', '#ff0080'];
    group.forEach(h => { const b = h.brand || 'Unknown'; brands[b] = (brands[b] || 0) + (h.commentsCount || 0); });
    return Object.entries(brands)
      .map(([name, count], i) => ({ name: name.toUpperCase(), count, color: colors[i % colors.length] }))
      .sort((a, b) => b.count - a.count);
  };

  // ── Competitive Pulse (solo para competencia) ──────────────────────────────
  const getPulse = () => {
    if (!compHistory.length) return [
      { name: 'Turismo City', score: 65 },
      { name: 'Booking', score: 58 },
      { name: 'Airbnb', score: 71 },
    ];
    const brands = {};
    compHistory.forEach(h => {
      const b = h.brand || 'Unknown';
      if (!brands[b]) brands[b] = { sum: 0, count: 0 };
      brands[b].sum += h.sentiment?.positive || 0;
      brands[b].count++;
    });
    return Object.entries(brands)
      .map(([name, val]) => ({ name, score: Math.round(val.sum / Math.max(1, val.count)) }))
      .sort((a, b) => b.score - a.score);
  };

  // ── Owned Pulse (por cada cuenta propia) ──────────────────────────────────
  const getOwnedPulse = () => {
    if (!ownedHistory.length) return [
      { name: 'Despegar',    score: 29, platform: 'instagram' },
      { name: 'Despegar AR', score: 9,  platform: 'instagram' },
      { name: 'Despegar',    score: 20, platform: 'tiktok'    },
    ];
    const entries = {};
    ownedHistory.forEach(h => {
      const key = `${h.brand}|${h.platform}`;
      if (!entries[key]) entries[key] = { name: h.brand, platform: h.platform, sum: 0, count: 0 };
      entries[key].sum += h.sentiment?.positive || 0;
      entries[key].count++;
    });
    return Object.values(entries).map(e => ({ ...e, score: Math.round(e.sum / Math.max(1, e.count)) }));
  };

  // ── Comentarios que requieren respuesta (solo owned) ──────────────────────
  const needsReply = ownedHistory.flatMap(h =>
    (h.comments_analyzed || [])
      .filter(c => c.requires_response)
      .map(c => ({ ...c, brand: h.brand, platform: h.platform }))
  ).slice(0, 6);

  // ── Suggested replies (solo owned) ────────────────────────────────────────
  const allReplies = ownedHistory.flatMap(h => (h.suggestedReplies || []).map(r => ({ ...r, brand: h.brand }))).slice(0, 4);

  // ── Topic clusters por grupo ───────────────────────────────────────────────
  const getClusters = (group) => {
    const map = {};
    group.flatMap(h => h.topicClusters || []).forEach(c => {
      if (!map[c.label]) map[c.label] = { ...c };
      else map[c.label].count += c.count;
    });
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 4);
  };
  const ownedClusters = getClusters(ownedHistory);
  const compClusters  = getClusters(compHistory);

  // ── Recomendaciones (solo owned) ──────────────────────────────────────────
  const allRecommendations = [...new Set(ownedHistory.flatMap(h => h.recommendations || []))].slice(0, 5);

  // ── WordCloud del scan owned más reciente ─────────────────────────────────
  const latestOwned = ownedHistory[0];
  const wordCloudData = latestOwned?.wordCloud?.length > 0 ? latestOwned.wordCloud : [
    { word: 'vuelos',       weight: 100 }, { word: 'reembolso',   weight: 92 },
    { word: 'cancelación',  weight: 88  }, { word: 'hotel',       weight: 85 },
    { word: 'reserva',      weight: 82  }, { word: 'atención',    weight: 78 },
    { word: 'precio',       weight: 75  }, { word: 'cliente',     weight: 72 },
    { word: 'respuesta',    weight: 68  }, { word: 'demora',      weight: 65 },
    { word: 'excelente',    weight: 62  }, { word: 'servicio',    weight: 60 },
    { word: 'rápido',       weight: 57  }, { word: 'problema',    weight: 55 },
    { word: 'necesito',     weight: 52  }, { word: 'paquete',     weight: 49 },
    { word: 'destino',      weight: 47  }, { word: 'viaje',       weight: 45 },
    { word: 'asistencia',   weight: 43  }, { word: 'días',        weight: 40 },
    { word: 'compré',       weight: 38  }, { word: 'resolver',    weight: 36 },
    { word: 'oferta',       weight: 34  }, { word: 'equipaje',    weight: 32 },
    { word: 'check-in',     weight: 30  }, { word: 'aeropuerto',  weight: 28 },
    { word: 'pasajes',      weight: 27  }, { word: 'urgente',     weight: 26 },
    { word: 'ayuda',        weight: 25  }, { word: 'cobro',       weight: 24 },
    { word: 'descuento',    weight: 23  }, { word: 'turismo',     weight: 22 },
    { word: 'confirmación', weight: 21  }, { word: 'maleta',      weight: 20 },
    { word: 'espera',       weight: 19  }, { word: 'tarjeta',     weight: 18 },
    { word: 'alojamiento',  weight: 17  }, { word: 'cupón',       weight: 16 },
    { word: 'soporte',      weight: 15  }, { word: 'online',      weight: 14 },
    { word: 'app',          weight: 13  }, { word: 'itinerario',  weight: 12 },
    { word: 'retiro',       weight: 11  }, { word: 'devolución',  weight: 10 },
    { word: 'booking',      weight: 9   },
  ];

  // ── Breakdown de sentimiento (owned más reciente) ─────────────────────────
  const breakdown = latestOwned?.sentiment_breakdown;

  return (
    <div className="space-y-12 pb-20">

      {/* ══════════════════ ZONA OWNED — DESPEGAR ══════════════════ */}
      <div className="space-y-6">
        {/* Header zona owned */}
        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-[#9B72F5]/20" />
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#9B72F5]/30 bg-[#9B72F5]/5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#9B72F5] animate-pulse" />
            <span className="text-[11px] font-black uppercase tracking-widest text-[#9B72F5]">Owned — Despegar</span>
          </div>
          <div className="h-px flex-1 bg-[#9B72F5]/20" />
        </div>

        {/* Scorecards owned */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Comentarios', value: ownedStats.comments || '–', color: 'text-fg', icon: MessageSquare },
            { label: 'Positivos',   value: ownedStats.comments ? `${ownedStats.pos}%`  : '–', color: 'text-accent-lemon', icon: TrendingUp },
            { label: 'Negativos',   value: ownedStats.comments ? `${ownedStats.neg}%`  : '–', color: 'text-accent-pink',  icon: AlertTriangle },
            { label: 'Neutrales',   value: ownedStats.comments ? `${ownedStats.neu}%`  : '–', color: 'text-fg/40',        icon: BarChart3 },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="pwa-card p-5 bg-[#9B72F5]/[0.03] border-[#9B72F5]/10 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-black uppercase tracking-widest text-fg/30">{label}</p>
                <Icon size={12} className="text-[#9B72F5]/40" />
              </div>
              <p className={`text-2xl font-black italic ${color}`}>{value}</p>
            </div>
          ))}
        </section>

        {/* Pulse owned + Sentiment Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Pulse por cuenta propia */}
          <section className="lg:col-span-5 pwa-card p-6 bg-[#9B72F5]/[0.02] border-[#9B72F5]/10 space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[#9B72F5]/80">Sentimiento por Cuenta</h3>
            <div className="space-y-4">
              {getOwnedPulse().map((item, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-widest">
                    <span className="text-fg/50">{item.name} <span className="text-fg/25 normal-case font-medium">{item.platform}</span></span>
                    <span className={item.score > 30 ? 'text-accent-lemon' : 'text-accent-pink'}>{item.score}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-fg/5 rounded-full overflow-hidden flex">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${item.score}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut', delay: i * 0.1 }}
                      className={`h-full rounded-full ${item.score > 30 ? 'bg-accent-lemon shadow-[0_0_6px_rgba(152,255,188,0.4)]' : 'bg-accent-pink shadow-[0_0_6px_rgba(255,83,186,0.3)]'}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Breakdown 5 niveles del scan más reciente owned */}
          <section className="lg:col-span-4 pwa-card p-6 bg-fg/[0.02] border-fg/5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-fg/40">Sentiment Breakdown</h3>
              <TrendingUp size={12} className="text-fg/20" />
            </div>
            {breakdown ? (
              <div className="space-y-3">
                <SentimentBar label="Muy Positivo" value={breakdown.very_positive || 0} color="text-accent-lemon" />
                <SentimentBar label="Positivo"     value={breakdown.positive      || 0} color="text-accent-lemon" />
                <SentimentBar label="Neutral"      value={breakdown.neutral       || 0} color="text-fg/30" />
                <SentimentBar label="Negativo"     value={breakdown.negative      || 0} color="text-accent-pink" />
                <SentimentBar label="Muy Negativo" value={breakdown.very_negative || 0} color="text-accent-pink" />
              </div>
            ) : (
              <p className="text-[11px] text-fg/20 italic text-center pt-4">Ejecutá un scan para ver datos reales</p>
            )}
          </section>

          {/* Alertas */}
          <section className="lg:col-span-3 space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-accent-pink/80">Alertas Activas</h3>
            {allAlerts.length > 0 ? (
              <div className="space-y-2">
                {allAlerts.slice(0, 3).map((alert, i) => (
                  <div key={i} className="pwa-card p-3 bg-accent-pink/5 border-accent-pink/20 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-accent-pink rounded-full animate-pulse shrink-0" />
                      <p className="text-[11px] font-black uppercase text-accent-pink truncate">{alert.author}</p>
                    </div>
                    <p className="text-[11px] text-fg/50 leading-tight line-clamp-2">{alert.message}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="pwa-card p-4 bg-fg/[0.02] border-fg/5 text-center">
                <p className="text-[11px] text-fg/20 italic">Sin alertas críticas</p>
              </div>
            )}
          </section>
        </div>

        {/* Requieren Respuesta (solo owned) */}
        {needsReply.length > 0 && (
          <section className="pwa-card p-6 bg-fg/[0.02] border-fg/5 space-y-4">
            <div className="flex items-center gap-3">
              <Zap size={13} className="text-accent-orange" />
              <h3 className="text-[10px] font-black uppercase tracking-widest text-accent-orange">Requieren Respuesta — Cuentas Propias</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {needsReply.map((c, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="p-4 bg-fg/[0.03] rounded-xl border border-fg/5 space-y-1.5 hover:bg-fg/[0.05] transition-all">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase text-accent-orange">@{c.author}</p>
                    <div className="flex items-center gap-2">
                      {c.category && <span className="text-[7px] font-black uppercase px-1.5 py-0.5 bg-fg/5 border border-fg/10 rounded-full text-fg/40">{categoryLabel[c.category] || c.category}</span>}
                      <span className="text-[10px] font-black uppercase text-[#9B72F5]/60">{c.brand}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-fg/50 italic line-clamp-2">"{c.text_preview}"</p>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Topic Clusters owned */}
        {ownedClusters.length > 0 && (
          <section className="pwa-card p-6 bg-fg/[0.02] border-fg/5 space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-fg/40">Topic Clusters — Owned</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {ownedClusters.map((cluster, i) => (
                <div key={i} className="p-4 bg-fg/[0.03] rounded-xl border border-fg/5 hover:bg-fg/[0.06] transition-all space-y-2">
                  <div className={`w-2 h-2 rounded-full ${cluster.sentiment === 'negative' ? 'bg-accent-pink shadow-[0_0_8px_rgba(255,83,186,0.4)]' : 'bg-[#9B72F5]'}`} />
                  <p className="text-sm font-bold italic text-fg tracking-tight">{cluster.label}</p>
                  <p className="text-[11px] font-black uppercase text-fg/20">{cluster.count} menciones</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ══════════════════ ZONA COMPETENCIA ══════════════════════ */}
      <div className="space-y-6">
        {/* Header zona competencia */}
        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-accent-pink/20" />
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-accent-pink/30 bg-accent-pink/5">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-pink" />
            <span className="text-[11px] font-black uppercase tracking-widest text-accent-pink">Competencia</span>
          </div>
          <div className="h-px flex-1 bg-accent-pink/20" />
        </div>

        {/* Scorecards competencia */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Comentarios', value: compStats.comments || '–', color: 'text-fg' },
            { label: 'Positivos',   value: compStats.comments ? `${compStats.pos}%`  : '–', color: 'text-accent-lemon' },
            { label: 'Negativos',   value: compStats.comments ? `${compStats.neg}%`  : '–', color: 'text-accent-pink'  },
            { label: 'Marcas',      value: compStats.brands.length || '–',                  color: 'text-fg/50'        },
          ].map(({ label, value, color }) => (
            <div key={label} className="pwa-card p-5 bg-accent-pink/[0.02] border-accent-pink/10 space-y-2">
              <p className="text-[11px] font-black uppercase tracking-widest text-fg/30">{label}</p>
              <p className={`text-2xl font-black italic ${color}`}>{value}</p>
            </div>
          ))}
        </section>

        {/* SOV competencia + Competitive Pulse */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-5">
            <ShareOfVoiceChart data={getSOV(compHistory).length ? getSOV(compHistory) : [
              { name: 'TURISMO CITY', count: 280, color: '#FF53BA' },
              { name: 'BOOKING',      count: 180, color: '#0070f3' },
              { name: 'AIRBNB',       count: 120, color: '#ccff00' },
            ]} />
          </section>

          <section className="lg:col-span-7 pwa-card p-6 bg-accent-pink/[0.02] border-accent-pink/10 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-accent-pink/80">Competitive Pulse</h3>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-accent-pink rounded-full animate-pulse" />
                <span className="text-[11px] font-black uppercase text-accent-pink tracking-widest">Live</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {getPulse().map((c, i) => (
                <div key={c.name} className="space-y-1.5">
                  <div className="flex justify-between text-[11px] font-black uppercase tracking-widest">
                    <span className="text-fg/40">{c.name}</span>
                    <span className={c.score > 25 ? 'text-accent-lemon' : 'text-accent-pink'}>{c.score}%</span>
                  </div>
                  <div className="h-1 w-full bg-fg/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${c.score}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut', delay: i * 0.1 }}
                      className={`h-full ${c.score > 25 ? 'bg-accent-lemon' : 'bg-accent-pink'} rounded-full`}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Topic Clusters competencia */}
            {compClusters.length > 0 && (
              <div className="border-t border-fg/5 pt-4 space-y-2">
                <p className="text-[11px] font-black uppercase tracking-widest text-fg/25">Temas destacados</p>
                <div className="flex flex-wrap gap-2">
                  {compClusters.map((c, i) => (
                    <span key={i} className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${
                      c.sentiment === 'negative' ? 'border-accent-pink/20 text-accent-pink/60 bg-accent-pink/5'
                        : 'border-fg/10 text-fg/30 bg-fg/5'
                    }`}>{c.label}</span>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ══════════ SECCIONES COMPARTIDAS ══════════════════════════ */}

      {/* AI Responder */}
      {allReplies.length > 0 && (
        <section className="pwa-card p-8 bg-accent-lemon/[0.03] border-accent-lemon/10 space-y-6">
          <div className="flex items-center gap-3">
            <Star size={14} className="text-accent-lemon" />
            <h3 className="text-xs font-black uppercase italic tracking-widest text-accent-lemon">AI Responder — Respuestas Sugeridas</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allReplies.map((r, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                className="p-5 bg-fg/[0.03] rounded-xl border border-fg/5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-black uppercase text-accent-orange">@{r.author}</p>
                  {r.priority === 'high' && <span className="text-[7px] font-black uppercase px-2 py-0.5 bg-accent-pink/20 border border-accent-pink/30 text-accent-pink rounded-full">⚡ Urgente</span>}
                  {r.brand && <span className="text-[10px] font-black uppercase text-fg/20">{r.brand}</span>}
                </div>
                <p className="text-[10px] text-fg/40 italic leading-relaxed">"{r.comment}"</p>
                <div className="border-t border-fg/5 pt-3">
                  <p className="text-[10px] font-bold text-fg/80 leading-relaxed">↳ "{r.reply}"</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Recomendaciones */}
      {allRecommendations.length > 0 && (
        <section className="pwa-card p-8 bg-fg/[0.02] border-fg/5 space-y-5">
          <h3 className="text-xs font-black uppercase italic tracking-widest text-fg/40">Recomendaciones Estratégicas — Despegar</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {allRecommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-3 p-4 bg-fg/[0.03] rounded-xl border border-fg/5">
                <ChevronRight size={12} className="text-[#9B72F5] mt-0.5 shrink-0" />
                <p className="text-xs font-bold text-fg/70">{rec}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Word Cloud */}
      <section className="w-full">
        <CyberWordCloud words={wordCloudData} />
      </section>

      {/* Executive Report */}
      {report && (
        <section className="pwa-card p-10 bg-gradient-to-br from-fg/[0.03] to-transparent border-fg/10 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent-lemon/5 blur-[100px] rounded-full -mr-20 -mt-20" />
          <div className="relative z-10 space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="px-4 py-1.5 bg-accent-lemon text-black font-black text-[10px] uppercase italic rounded-full shadow-[0_0_20px_rgba(152,255,188,0.4)]">Executive Report</div>
                <span className="text-[10px] font-black uppercase text-fg/20 tracking-widest">{report.week_label || getWeekLabel()}</span>
              </div>
            </div>
            <p className="text-lg font-bold italic text-fg/80 leading-relaxed max-w-3xl">{report.executiveBrief}</p>
            {report.brandPerformance?.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {report.brandPerformance.map((bp, i) => (
                  <div key={i} className="p-4 bg-fg/[0.03] rounded-xl border border-fg/5 space-y-2">
                    <p className="text-[10px] font-black uppercase text-fg/30">{bp.brand}</p>
                    <p className="text-sm font-black italic text-fg">{bp.status}{bp.sentiment_delta && <span className="text-[11px] ml-1 text-fg/40 normal-case">{bp.sentiment_delta}</span>}</p>
                    <p className="text-[11px] font-medium text-fg/60 leading-tight">{bp.keyFinding}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

    </div>
  );
};

export default DashboardView;
