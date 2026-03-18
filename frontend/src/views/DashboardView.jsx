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
      <span className="text-[9px] font-black uppercase tracking-widest text-fg/30">{label}</span>
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

  // ── Guardia: normalizar siempre a arrays para evitar .map()/.flatMap() crash ──
  const history = Array.isArray(rawHistory) ? rawHistory : [];
  const alerts = Array.isArray(rawAlerts) ? rawAlerts : [];

  // ── Datos agregados del historial ──────────────────────────────────────────
  const totalComments = history.reduce((acc, h) => acc + (h.commentsCount || 0), 0);
  const avgSentimentPos = history.length > 0
    ? Math.round(history.reduce((acc, h) => acc + (h.sentiment?.positive || 0), 0) / history.length)
    : 0;

  // Alertas reales de Gemini (de todos los scans) + alertas del backend
  const geminiAlerts = history.flatMap(h => h.alerts || []);
  const allAlerts = [...alerts, ...geminiAlerts];

  // Share of Voice
  const getSOV = () => {
    if (!history || history.length < 2) return [
      { name: 'DESPEGAR', count: 450, color: '#D3C4F6' },
      { name: 'TURISMO CITY', count: 280, color: '#FF53BA' },
      { name: 'BOOKING', count: 180, color: '#0070f3' },
      { name: 'AIRBNB', count: 120, color: '#ccff00' },
    ];
    const brands = {};
    history.forEach(h => {
      const b = h.brand || 'Unknown';
      brands[b] = (brands[b] || 0) + (h.commentsCount || 0);
    });
    const colors = ['#98FFBC', '#FF53BA', '#ff7700', '#0070f3', '#ccff00', '#ff0080'];
    return Object.entries(brands)
      .map(([name, count], i) => ({ name: name.toUpperCase(), count, color: colors[i % colors.length] }))
      .sort((a, b) => b.count - a.count).slice(0, 4);
  };

  // Competitive Pulse
  const getPulse = () => {
    if (!history || history.length < 2) return [
      { name: 'Despegar Portfolio', score: 82 },
      { name: 'Turismo City', score: 65 },
      { name: 'Booking', score: 58 },
      { name: 'Airbnb', score: 71 },
    ];
    const brands = {};
    const owned = ['Despegar', 'Despegar AR'];
    history.forEach(h => {
      const b = h.brand || 'Unknown';
      if (!brands[b]) brands[b] = { sum: 0, count: 0, isOwned: owned.includes(h.brand) };
      brands[b].sum += h.sentiment?.positive || 0;
      brands[b].count++;
    });
    const pulse = Object.entries(brands).map(([name, val]) => ({
      name, score: Math.round(val.sum / Math.max(1, val.count)), isOwned: val.isOwned,
    }));
    const ownedItems = pulse.filter(p => p.isOwned);
    const ownedScore = ownedItems.length > 0
      ? Math.round(ownedItems.reduce((acc, p) => acc + p.score, 0) / ownedItems.length)
      : 82;
    return [{ name: 'Despegar Portfolio', score: ownedScore, isOwned: true }, ...pulse.filter(p => !p.isOwned).slice(0, 3)];
  };

  // Cuentas de mayor alcance reales de los comments_analyzed
  const topInfluencers = (() => {
    const all = history.flatMap(h => (h.comments_analyzed || []).map(c => ({ ...c, brand: h.brand })));
    const seen = new Set();
    return all
      .filter(c => c.followers > 0 && !seen.has(c.author) && seen.add(c.author))
      .sort((a, b) => (b.followers || 0) - (a.followers || 0))
      .slice(0, 5);
  })();

  // Comentarios que requieren respuesta
  const needsReply = history.flatMap(h =>
    (h.comments_analyzed || [])
      .filter(c => c.requires_response)
      .map(c => ({ ...c, brand: h.brand }))
  ).slice(0, 5);

  // Suggested replies
  const allReplies = history.flatMap(h => (h.suggestedReplies || []).map(r => ({ ...r, brand: h.brand }))).slice(0, 4);

  // Topic clusters agregados
  const allClusters = (() => {
    const map = {};
    history.flatMap(h => h.topicClusters || []).forEach(c => {
      if (!map[c.label]) map[c.label] = { ...c };
      else map[c.label].count += c.count;
    });
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 8);
  })();

  // Recomendaciones únicas
  const allRecommendations = [...new Set(history.flatMap(h => h.recommendations || []))].slice(0, 5);

  // WordCloud del scan más reciente (o fallback)
  const wordCloudData = history[0]?.wordCloud?.length > 0 ? history[0].wordCloud : [
    { word: 'PRECIO', weight: 95 }, { word: 'VUELOS', weight: 90 },
    { word: 'HOTEL', weight: 85 }, { word: 'RESERVA', weight: 80 },
    { word: 'DEMORA', weight: 60 }, { word: 'REEMBOLSO', weight: 55 },
    { word: 'EXCELENTE', weight: 85 }, { word: 'RÁPIDO', weight: 70 },
    { word: 'ATENCIÓN', weight: 50 }, { word: 'ME ENCANTA', weight: 100 },
  ];

  // Breakdown de sentimiento del scan más reciente
  const breakdown = history[0]?.sentiment_breakdown;

  return (
    <div className="space-y-10 pb-20">

      {/* ── Metric Cards ────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          title="Menciones Totales"
          value={history.length > 0 ? (totalComments > 999 ? `${(totalComments / 1000).toFixed(1)}k` : totalComments) : '–'}
          change={history.length > 0 ? '+12' : '0'}
          icon={MessageSquare}
        />
        <MetricCard
          title="Sentiment Health"
          value={history.length > 0 ? `${avgSentimentPos}%` : '–'}
          change={history.length > 0 ? '+5' : '0'}
          icon={BarChart3}
        />
        <MetricCard
          title="Riesgos Activos"
          value={allAlerts.length || '0'}
          change={allAlerts.length > 0 ? String(allAlerts.length) : '0'}
          icon={AlertTriangle}
        />
      </section>

      {/* ── Alertas Reales de Alto Impacto ──────────────────────────── */}
      {allAlerts.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="pwa-card p-6 bg-accent-pink/5 border-accent-pink/20 space-y-4"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle size={14} className="text-accent-pink" />
            <h3 className="text-[10px] font-black uppercase tracking-widest text-accent-pink">Alertas de Alto Impacto</h3>
          </div>
          <div className="space-y-3">
            {allAlerts.slice(0, 4).map((alert, i) => (
              <div key={i} className="flex items-start gap-4 p-3 bg-fg/[0.02] rounded-xl border border-fg/5">
                <div className="w-1.5 h-1.5 bg-accent-pink rounded-full mt-1.5 shrink-0 animate-pulse" />
                <div>
                  <p className="text-[10px] font-black uppercase text-accent-pink">{alert.author}
                    {alert.followers && <span className="ml-2 text-fg/30 normal-case font-medium">{(alert.followers / 1000).toFixed(1)}k seguidores</span>}
                  </p>
                  <p className="text-xs text-fg/60 mt-0.5">{alert.message}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {/* ── Executive Report ─────────────────────────────────────────── */}
      {report && (
        <section className="pwa-card p-10 bg-gradient-to-br from-fg/[0.03] to-transparent border-fg/10 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent-lemon/5 blur-[100px] rounded-full -mr-20 -mt-20 group-hover:bg-accent-lemon/10 transition-all duration-700" />
          <div className="relative z-10 space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="px-4 py-1.5 bg-accent-lemon text-black font-black text-[10px] uppercase italic rounded-full shadow-[0_0_20px_rgba(152,255,188,0.4)]">Executive Report</div>
                <h2 className="text-2xl font-black italic uppercase tracking-tighter text-fg">Strategic Management Briefing</h2>
                {report._isDemo && (
                  <span className="px-3 py-1 bg-accent-orange/20 border border-accent-orange/40 text-accent-orange text-[9px] font-black uppercase tracking-widest rounded-full">Demo</span>
                )}
              </div>
              <span className="text-[10px] font-black uppercase text-fg/20 tracking-widest">{report.week_label || getWeekLabel()}</span>
            </div>

            <p className="text-lg font-bold text-fg/90 italic leading-relaxed max-w-4xl">"{report.executiveBrief}"</p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {report.brandPerformance?.map((bp, i) => (
                <div key={i} className="space-y-1">
                  <p className="text-[10px] font-black uppercase text-fg/30">{bp.brand}</p>
                  <p className={`font-black uppercase italic text-sm ${bp.status === 'Crisis' ? 'text-accent-pink' : bp.status === 'At Risk' ? 'text-accent-orange' : 'text-accent-lemon'}`}>
                    {bp.status}{bp.sentiment_delta && <span className="text-[9px] ml-1 text-fg/40 normal-case">{bp.sentiment_delta}</span>}
                  </p>
                  <p className="text-[11px] font-medium text-fg/60 leading-tight">{bp.keyFinding}</p>
                </div>
              ))}
            </div>

            <div className="pt-6 border-t border-fg/5 grid grid-cols-1 md:grid-cols-3 gap-10">
              <div className="space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-accent-pink">Top Strategic Risk</h4>
                <p className="text-xs font-bold text-fg/80">{report.topStrategicRisk}</p>
              </div>
              {report.opportunities?.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-accent-lemon">Opportunities</h4>
                  <ul className="space-y-1">
                    {report.opportunities.map((o, i) => (
                      <li key={i} className="text-[10px] font-medium text-fg/60 flex items-start gap-1.5">
                        <ChevronRight size={10} className="mt-0.5 shrink-0 text-accent-lemon" />{o}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-accent-lemon">Action Plan</h4>
                <div className="flex flex-wrap gap-2">
                  {report.nextSteps?.map((step, i) => (
                    <span key={i} className="text-[9px] font-black uppercase px-3 py-1 bg-fg/5 border border-fg/10 rounded-full">{step}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── SOV / Pulse / Sentiment Breakdown ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <section className="lg:col-span-4 space-y-6">
          <ShareOfVoiceChart data={getSOV()} />
        </section>

        <section className="lg:col-span-4 pwa-card p-8 bg-fg/[0.02] border-fg/5 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase italic tracking-widest text-fg/40">Competitive Pulse</h3>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-accent-lemon rounded-full animate-pulse" />
              <span className="text-[9px] font-black uppercase text-accent-lemon tracking-widest">Live</span>
            </div>
          </div>
          <div className="space-y-5 pt-2">
            {getPulse().map(c => (
              <div key={c.name} className="space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                  <span className="opacity-40">{c.name}</span>
                  <span className={c.score > 70 ? 'text-accent-lemon' : 'opacity-40'}>{c.score}pts</span>
                </div>
                <div className="h-1 w-full bg-fg/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${c.score}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className={`h-full ${c.score > 75 ? 'bg-accent-lemon shadow-[0_0_8px_rgba(152,255,188,0.4)]' : 'bg-fg/20'}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Sentiment Breakdown 5 niveles */}
        <section className="lg:col-span-4 pwa-card p-8 bg-fg/[0.02] border-fg/5 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase italic tracking-widest text-fg/40">Sentiment Breakdown</h3>
            <TrendingUp size={14} className="text-fg/20" />
          </div>
          {breakdown ? (
            <div className="space-y-4 pt-2">
              <SentimentBar label="Muy Positivo" value={breakdown.very_positive || 0} color="text-accent-lemon" />
              <SentimentBar label="Positivo" value={breakdown.positive || 0} color="text-accent-lemon" />
              <SentimentBar label="Neutral" value={breakdown.neutral || 0} color="text-fg/30" />
              <SentimentBar label="Negativo" value={breakdown.negative || 0} color="text-accent-pink" />
              <SentimentBar label="Muy Negativo" value={breakdown.very_negative || 0} color="text-accent-pink" />
            </div>
          ) : (
            <div className="space-y-4 pt-2 opacity-30">
              {['Muy Positivo', 'Positivo', 'Neutral', 'Negativo', 'Muy Negativo'].map(l => (
                <SentimentBar key={l} label={l} value={0} color="text-fg/20" />
              ))}
              <p className="text-[9px] text-fg/30 italic text-center pt-2">Ejecutá un scan para ver datos reales</p>
            </div>
          )}
        </section>
      </div>

      {/* ── Topic Clusters ───────────────────────────────────────────── */}
      {allClusters.length > 0 && (
        <section className="pwa-card p-8 bg-fg/[0.02] border-fg/5 space-y-6">
          <h3 className="text-xs font-black uppercase italic tracking-widest text-fg/40">Topic Clusters</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {allClusters.map((cluster, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="p-4 bg-fg/[0.03] rounded-xl border border-fg/5 hover:bg-fg/[0.06] transition-all space-y-2"
              >
                <div className={`w-2 h-2 rounded-full ${cluster.sentiment === 'negative' ? 'bg-accent-pink shadow-[0_0_8px_rgba(255,83,186,0.4)]' : cluster.sentiment === 'positive' ? 'bg-accent-lemon' : 'bg-fg/20'}`} />
                <p className="text-sm font-bold italic text-fg tracking-tight">{cluster.label}</p>
                <p className="text-[9px] font-black uppercase text-fg/20">{cluster.count} menciones</p>
                {cluster.representative_quote && (
                  <p className="text-[9px] text-fg/30 italic leading-tight">"{cluster.representative_quote.substring(0, 50)}..."</p>
                )}
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* ── Ambassador Hub (Cuentas reales) + Requires Reply ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        <section className="lg:col-span-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black italic uppercase tracking-widest text-fg/40">Ambassador Hub</h3>
            <div className="flex items-center gap-2">
              <Users size={12} className="text-accent-lemon" />
              <span className="text-[9px] font-black uppercase text-accent-lemon">Top Reach</span>
            </div>
          </div>
          {topInfluencers.length > 0 ? (
            <div className="space-y-3">
              {topInfluencers.map((fan, i) => {
                const badge = impactBadge[fan.impact] || impactBadge.low;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="pwa-card p-4 bg-fg/[0.02] border-fg/5 flex items-center gap-4 hover:bg-fg/[0.04] transition-all"
                  >
                    <div className="w-9 h-9 rounded-xl bg-fg/10 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-black text-fg/40">{fan.author?.charAt(1)?.toUpperCase() || '?'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black italic uppercase text-[10px] text-fg truncate">@{fan.author}</p>
                      <p className="text-[8px] font-black uppercase text-fg/30 tracking-widest">{fan.brand}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-[9px] font-black text-accent-lemon uppercase">
                        {fan.followers >= 1000 ? `${(fan.followers / 1000).toFixed(1)}k` : fan.followers}
                      </span>
                      <span className={`text-[7px] font-black px-1.5 py-0.5 rounded border uppercase ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    {fan.sentiment && (
                      <div className={`w-2 h-2 rounded-full shrink-0 ${sentimentDot(fan.sentiment)}`} />
                    )}
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="pwa-card p-8 bg-fg/[0.02] border-fg/5 flex items-center justify-center">
              <p className="text-[10px] font-black uppercase text-fg/20 italic text-center">
                Los usuarios con mayor alcance aparecerán<br />después del primer scan real
              </p>
            </div>
          )}
        </section>

        {/* Comentarios que Requieren Respuesta */}
        <section className="lg:col-span-7 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black italic uppercase tracking-widest text-fg/40">Requieren Respuesta</h3>
            <div className="flex items-center gap-2">
              <Zap size={12} className="text-accent-orange" />
              <span className="text-[9px] font-black uppercase text-accent-orange">Action Required</span>
            </div>
          </div>
          {needsReply.length > 0 ? (
            <div className="space-y-3">
              {needsReply.map((c, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="pwa-card p-4 bg-fg/[0.02] border-fg/5 space-y-2 hover:bg-fg/[0.04] transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-black uppercase text-accent-orange">@{c.author}</p>
                      {c.followers > 0 && (
                        <span className="text-[8px] text-fg/30">· {c.followers >= 1000 ? `${(c.followers / 1000).toFixed(1)}k` : c.followers} seguidores</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {c.category && (
                        <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-fg/5 border border-fg/10 rounded-full text-fg/40">
                          {categoryLabel[c.category] || c.category}
                        </span>
                      )}
                      {c.brand && <span className="text-[8px] font-black uppercase text-accent-lemon">{c.brand}</span>}
                    </div>
                  </div>
                  <p className="text-xs text-fg/60 italic">"{c.text_preview}"</p>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="pwa-card p-8 bg-fg/[0.02] border-fg/5 flex items-center justify-center">
              <p className="text-[10px] font-black uppercase text-fg/20 italic text-center">
                Ningún comentario crítico detectado<br />o aún no hay datos reales cargados
              </p>
            </div>
          )}
        </section>
      </div>

      {/* ── AI Responder ─────────────────────────────────────────────── */}
      {allReplies.length > 0 && (
        <section className="pwa-card p-8 bg-accent-lemon/[0.03] border-accent-lemon/10 space-y-6">
          <div className="flex items-center gap-3">
            <Star size={14} className="text-accent-lemon" />
            <h3 className="text-xs font-black uppercase italic tracking-widest text-accent-lemon">AI Responder — Respuestas Sugeridas</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allReplies.map((r, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className="p-5 bg-fg/[0.03] rounded-xl border border-fg/5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-black uppercase text-accent-orange">@{r.author}</p>
                  {r.priority === 'high' && (
                    <span className="text-[7px] font-black uppercase px-2 py-0.5 bg-accent-pink/20 border border-accent-pink/30 text-accent-pink rounded-full">⚡ Urgente</span>
                  )}
                  {r.brand && <span className="text-[8px] font-black uppercase text-fg/20">{r.brand}</span>}
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

      {/* ── Recommendations ──────────────────────────────────────────── */}
      {allRecommendations.length > 0 && (
        <section className="pwa-card p-8 bg-fg/[0.02] border-fg/5 space-y-5">
          <h3 className="text-xs font-black uppercase italic tracking-widest text-fg/40">Recomendaciones Estratégicas</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {allRecommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-3 p-4 bg-fg/[0.03] rounded-xl border border-fg/5">
                <ChevronRight size={12} className="text-accent-lemon mt-0.5 shrink-0" />
                <p className="text-xs font-bold text-fg/70">{rec}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Word Cloud ───────────────────────────────────────────────── */}
      <section className="w-full">
        <CyberWordCloud words={wordCloudData} />
      </section>

    </div>
  );
};

export default DashboardView;
