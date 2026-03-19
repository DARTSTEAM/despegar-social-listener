import { motion } from 'framer-motion';

// Paleta por rango
const rankStyle = (i, n) => {
  const p = i / Math.max(n - 1, 1);
  if (p < 0.08) return { color: '#9B72F5', weight: 900 };
  if (p < 0.20) return { color: '#ffffff', weight: 800 };
  if (p < 0.35) return { color: '#FF53BA', weight: 700 };
  if (p < 0.55) return { color: '#98FFBC', weight: 600 };
  return { color: 'rgba(255,255,255,0.42)', weight: 400 };
};

const CyberWordCloud = ({ words }) => {
  if (!words?.length) return null;

  const sorted = [...words]
    .sort((a, b) => (b.weight || 0) - (a.weight || 0))
    .slice(0, 30);

  const max = sorted[0]?.weight || 1;

  // Top 6 → pills grandes; resto → lista compacta
  const topPills = sorted.slice(0, 6);
  const rest     = sorted.slice(6);

  return (
    <div className="pwa-card bg-fg/[0.02] border-fg/5 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 bg-[#9B72F5] rounded-full" />
        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-fg/40 italic">
          Términos más frecuentes
        </span>
      </div>

      {/* Top 6 — pills grandes con barra */}
      <div className="space-y-2">
        {topPills.map((w, i) => {
          const pct   = Math.round((w.weight / max) * 100);
          const style = rankStyle(i, sorted.length);
          const rank  = String(i + 1).padStart(2, '0');

          return (
            <motion.div
              key={w.word}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: i * 0.06 }}
              className="group flex items-center gap-3"
            >
              {/* Número */}
              <span className="text-[9px] font-black tabular-nums text-fg/15 w-5 shrink-0">{rank}</span>

              {/* Palabra + barra */}
              <div className="flex-1 space-y-1">
                <span
                  className="block text-sm leading-none tracking-tight uppercase"
                  style={{ color: style.color, fontWeight: style.weight }}
                >
                  {w.word}
                </span>
                <div className="h-[3px] w-full bg-fg/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.7, delay: i * 0.06 + 0.1, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ background: style.color }}
                  />
                </div>
              </div>

              {/* Peso */}
              <span className="text-[9px] font-black tabular-nums text-fg/20 shrink-0">
                {w.weight}×
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Divisor */}
      {rest.length > 0 && (
        <div className="h-px bg-fg/5" />
      )}

      {/* Resto — chips compactos en flex-wrap */}
      {rest.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {rest.map((w, i) => {
            const style = rankStyle(i + 6, sorted.length);
            const pct   = Math.round((w.weight / max) * 100);
            // Tamaño de fuente proporcional: 9–13px
            const fs = 9 + Math.round((pct / 100) * 4);

            return (
              <motion.span
                key={w.word}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25, delay: (i + 6) * 0.025 }}
                className="px-2 py-0.5 rounded-full border border-fg/8 cursor-default
                           hover:border-[#9B72F5]/40 hover:bg-[#9B72F5]/5 transition-all"
                style={{ color: style.color, fontWeight: style.weight, fontSize: `${fs}px` }}
                title={`${w.weight}×`}
              >
                {w.word}
              </motion.span>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CyberWordCloud;
