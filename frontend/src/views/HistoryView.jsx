import { useState, useMemo } from 'react';
import CustomDropdown from '../components/CustomDropdown';

const SENTIMENTS = [
  { label: 'Todos los sentimientos', value: '' },
  { label: '✅ Positivo',           value: 'positive' },
  { label: '⚠️ Neutral',            value: 'neutral' },
  { label: '🔴 Negativo',           value: 'negative' },
  { label: '⭐ Muy Positivo',       value: 'very_positive' },
  { label: '🚨 Muy Negativo',       value: 'very_negative' },
];

// Asigna etiqueta de sentimiento basada en cuál porcentaje domina
function dominantSentiment(pos, neg, neu) {
  if (!pos && !neg && !neu) return 'neutral'; // sin datos
  if (pos >= neg && pos >= neu) return 'positive';
  if (neg >= pos && neg >= neu) return 'negative';
  return 'neutral';
}

const PAGE_SIZE = 20;

function HistoryView({ selectedBrand, setSelectedBrand, selectedPlatform, setSelectedPlatform, historicalData: rawHistoricalData }) {
  const [sentimentFilter, setSentimentFilter] = useState('');

  const [page, setPage]                        = useState(1);

  // ─── Normalizar datos ────────────────────────────────────────────────────
  const scans = useMemo(() => {
    const raw = Array.isArray(rawHistoricalData) ? rawHistoricalData : [];
    // Filtrar documentos corruptos o sin datos útiles
    return raw.filter(s =>
      s.brand &&
      s.platform &&
      !['aggregate', 'social', 'youtube'].includes(s.platform) &&
      (s.commentsCount > 0 || (s.raw_comments?.length > 0) || (s.comments_analyzed?.length > 0))
    );
  }, [rawHistoricalData]);

  // ─── Extraer todos los comentarios aplanados ─────────────────────────────
  const allComments = useMemo(() =>
    scans.flatMap(scan => {
      const comments = Array.isArray(scan.comments_analyzed) ? scan.comments_analyzed
                     : Array.isArray(scan.raw_comments)      ? scan.raw_comments
                     : [];

      return comments.map(c => {
        // Usar el sentiment individual del comentario que asignó Gemini
        // Normalizar very_positive → positive, very_negative → negative para el filtro simple
        const rawSent = c.sentiment || 'neutral';
        const sentLabel = rawSent; // conservamos granular para mostrar

        return {
          ...c,
          brand:    scan.brand,
          platform: scan.platform,
          sentLabel,
          scanPos:  scan.sentiment?.positive  || 0,
          scanNeg:  scan.sentiment?.negative  || 0,
          scanNeu:  scan.sentiment?.neutral   || 0,
        };
      });
    }),
  [scans]);

  // ─── Filtros aplicados ─────────────────────────────────────────────────────
  // Se calcula ANTES que stats para que las scorecards reflejen la selección
  const filtered = useMemo(() => {
    setPage(1);
    return allComments.filter(c => {
      if (selectedBrand    && c.brand    !== selectedBrand)                                 return false;
      if (selectedPlatform && c.platform?.toLowerCase() !== selectedPlatform.toLowerCase()) return false;
      if (sentimentFilter) {
        if (sentimentFilter === 'positive'      && c.sentLabel !== 'positive'      && c.sentLabel !== 'very_positive') return false;
        if (sentimentFilter === 'negative'      && c.sentLabel !== 'negative'      && c.sentLabel !== 'very_negative') return false;
        if (sentimentFilter === 'neutral'       && c.sentLabel !== 'neutral')       return false;
        if (sentimentFilter === 'very_positive' && c.sentLabel !== 'very_positive') return false;
        if (sentimentFilter === 'very_negative' && c.sentLabel !== 'very_negative') return false;
      }
      return true;
    });
  }, [allComments, selectedBrand, selectedPlatform, sentimentFilter]);

  // ─── Stats reactivos al filtro de Marca + Canal (pero no al de sentimiento) ─
  // Así los % muestran la distribución real del universo visible,
  // y al filtrar por sentimiento se ve el subset pero con % del total filtrado
  const baseForStats = useMemo(() =>
    allComments.filter(c => {
      if (selectedBrand    && c.brand    !== selectedBrand)                                 return false;
      if (selectedPlatform && c.platform?.toLowerCase() !== selectedPlatform.toLowerCase()) return false;
      return true;
    }),
  [allComments, selectedBrand, selectedPlatform]);

  const stats = useMemo(() => {
    const src = baseForStats;
    if (src.length === 0) return { total: 0, pos: 0, neg: 0, neu: 0 };
    const pos = src.filter(c => c.sentLabel === 'positive' || c.sentLabel === 'very_positive').length;
    const neg = src.filter(c => c.sentLabel === 'negative' || c.sentLabel === 'very_negative').length;
    const neu = src.filter(c => c.sentLabel === 'neutral').length;
    return {
      total: src.length,
      pos:   Math.round(pos / src.length * 100),
      neg:   Math.round(neg / src.length * 100),
      neu:   Math.round(neu / src.length * 100),
    };
  }, [baseForStats]);

  // ─── Paginación ───────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const clearAll = () => {
    setSelectedBrand('');
    setSelectedPlatform('');
    setSentimentFilter('');
    setTopicFilter('');
  };
  const hasFilters = selectedBrand || selectedPlatform || sentimentFilter;

  return (
    <section className="space-y-10 pb-20">
      {/* ── Título ── */}
      <h1 className="pwa-title text-fg leading-tight">
        Historial de <br /><span className="text-fg/40">Comentarios</span>
      </h1>

      {/* ── Stats cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total comentarios', value: allComments.length.toLocaleString(), color: 'text-fg', bar: null },
          { label: 'Positivos',         value: `${stats.pos}%`,  color: 'text-accent-lemon', bar: stats.pos,  barColor: 'bg-accent-lemon' },
          { label: 'Negativos',         value: `${stats.neg}%`,  color: 'text-accent-pink',  bar: stats.neg,  barColor: 'bg-accent-pink'  },
          { label: 'Neutrales',         value: `${stats.neu}%`,  color: 'text-fg/50',        bar: stats.neu,  barColor: 'bg-fg/30'        },
        ].map(({ label, value, color, bar, barColor }) => (
          <div key={label} className="pwa-card p-5 bg-fg/[0.02] border-fg/5 space-y-3">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-fg/30">{label}</p>
            <p className={`text-2xl font-black italic ${color}`}>{value}</p>
            {bar !== null && bar !== undefined && (
              <div className="h-1 w-full bg-fg/5 rounded-full overflow-hidden">
                <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${bar}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Filtros ── */}
      <div className="pwa-card p-6 bg-fg/[0.02] border-fg/5 space-y-5">
        {/* Dropdowns row */}
        <div className="flex flex-wrap gap-4 items-center">
          <CustomDropdown
            label="Marca"
            value={selectedBrand}
            onChange={v => { setSelectedBrand(v); setPage(1); }}
            options={[
              { label: 'Todas las marcas', value: '' },
              ...[...new Set(scans.map(s => s.brand).filter(Boolean))].map(b => ({ label: b, value: b })),
            ]}
          />
          <CustomDropdown
            label="Canal"
            value={selectedPlatform}
            onChange={v => { setSelectedPlatform(v); setPage(1); }}
            options={[
              { label: 'Todos los canales', value: '' },
              { label: 'TikTok',            value: 'tiktok' },
              { label: 'Instagram',         value: 'instagram' },
            ]}
          />
          <CustomDropdown
            label="Sentimiento"
            value={sentimentFilter}
            onChange={v => { setSentimentFilter(v); setPage(1); }}
            options={SENTIMENTS}
          />

          {hasFilters && (
            <button
              onClick={clearAll}
              className="ml-2 text-[11px] font-black uppercase italic tracking-widest text-fg/30 hover:text-accent-orange transition-colors"
            >
              ✕ Limpiar
            </button>
          )}
        </div>

        {/* Resultado count */}
        <div className="flex items-center gap-3 text-[11px] font-black uppercase tracking-widest text-fg/25">
          <span>{filtered.length} comentarios</span>
          {hasFilters && <><span className="w-px h-3 bg-fg/10" /><span className="text-accent-orange">Filtrado de {allComments.length}</span></>}
          <span className="w-px h-3 bg-fg/10" />
          <span>Pág. {page}/{totalPages}</span>
        </div>
      </div>

      {/* ── Tabla ── */}
      <div className="pwa-card overflow-hidden border-fg/5 bg-fg/[0.02]">
        <table className="w-full text-left">
          <thead className="bg-fg/5 border-b border-fg/10">
            <tr>
              <th className="px-6 py-5 text-[11px] font-black uppercase tracking-[0.2em] text-fg/30">Usuario</th>
              <th className="px-6 py-5 text-[11px] font-black uppercase tracking-[0.2em] text-fg/30">Comentario</th>

              <th className="px-6 py-5 text-[11px] font-black uppercase tracking-[0.2em] text-fg/30">Canal</th>
              <th className="px-6 py-5 text-[11px] font-black uppercase tracking-[0.2em] text-fg/30">Marca</th>
              <th className="px-6 py-5 text-[11px] font-black uppercase tracking-[0.2em] text-fg/30">Sent.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-fg/[0.03] text-sm">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-8 py-20 text-center">
                  <p className="text-fg/20 italic text-sm">
                    {allComments.length === 0
                      ? 'Sin datos — ejecutá un escaneo desde Configuración.'
                      : 'Sin resultados para los filtros aplicados.'}
                  </p>
                  {hasFilters && (
                    <button onClick={clearAll} className="mt-4 text-[11px] uppercase font-black italic text-accent-orange hover:underline">
                      Limpiar filtros
                    </button>
                  )}
                </td>
              </tr>
            ) : paginated.map((c, i) => (
              <tr key={i} className="hover:bg-fg/[0.02] transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex flex-col min-w-[90px]">
                    <span className="font-bold text-accent-orange text-[10px] tracking-tight">@{c.author || 'anónimo'}</span>
                    <span className="text-[10px] font-black uppercase opacity-20 mt-0.5 text-fg">
                      {(c.followers || 0).toLocaleString()} flw
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 max-w-xs">
                  <p className="text-[11px] font-medium text-fg/75 italic leading-snug line-clamp-2">
                    "{c.text || c.text_preview || '—'}"
                  </p>
                </td>

                <td className="px-6 py-4">
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${
                    c.platform === 'tiktok'
                      ? 'bg-white/5 border-white/10 text-fg/40'
                      : 'bg-accent-pink/5 border-accent-pink/20 text-accent-pink/70'
                  }`}>
                    {c.platform || '—'}
                  </span>
                </td>
                <td className="px-6 py-4 font-black italic uppercase text-[11px] tracking-widest text-fg/50">
                  {c.brand}
                </td>
                <td className="px-6 py-4">
                  {(c.sentLabel === 'positive' || c.sentLabel === 'very_positive') && (
                    <div className="flex items-center gap-1.5 text-accent-lemon">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent-lemon shadow-[0_0_6px_rgba(152,255,188,0.6)]" />
                      <span className="text-[10px] font-black uppercase">{c.sentLabel === 'very_positive' ? 'Muy Pos' : 'Pos'}</span>
                    </div>
                  )}
                  {(c.sentLabel === 'negative' || c.sentLabel === 'very_negative') && (
                    <div className="flex items-center gap-1.5 text-accent-pink">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent-pink shadow-[0_0_6px_rgba(255,83,186,0.6)]" />
                      <span className="text-[10px] font-black uppercase">{c.sentLabel === 'very_negative' ? 'Muy Neg' : 'Neg'}</span>
                    </div>
                  )}
                  {c.sentLabel === 'neutral' && (
                    <div className="flex items-center gap-1.5 text-fg/40">
                      <div className="w-1.5 h-1.5 rounded-full bg-fg/30" />
                      <span className="text-[10px] font-black uppercase">Neu</span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── Paginación ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-fg/5">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-1.5 rounded-full text-[11px] font-black uppercase italic border border-fg/10 text-fg/40 hover:text-fg/80 hover:border-fg/30 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
            >
              ← Anterior
            </button>

            <div className="flex gap-1">
              {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                // Mostrar páginas alrededor de la actual
                let pageNum;
                if (totalPages <= 7)       pageNum = i + 1;
                else if (page <= 4)        pageNum = i + 1;
                else if (page >= totalPages - 3) pageNum = totalPages - 6 + i;
                else                       pageNum = page - 3 + i;

                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-7 h-7 rounded-full text-[11px] font-black transition-all ${
                      pageNum === page
                        ? 'bg-accent-lemon text-black shadow-[0_0_10px_rgba(152,255,188,0.3)]'
                        : 'text-fg/30 hover:text-fg/70 hover:bg-fg/5'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-1.5 rounded-full text-[11px] font-black uppercase italic border border-fg/10 text-fg/40 hover:text-fg/80 hover:border-fg/30 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export default HistoryView;
