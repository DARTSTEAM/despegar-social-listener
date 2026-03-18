import { useState, useEffect, useRef } from 'react';
import cloud from 'd3-cloud';

const H = 480; // altura fija — d3-cloud necesita valor real

// Color por rango (posición en ranking de frecuencia)
const rankColor = (rank, total) => {
  const p = rank / Math.max(total - 1, 1);
  if (p < 0.07) return '#D3C4F6';            // lavanda — top
  if (p < 0.18) return '#ffffff';            // blanco
  if (p < 0.33) return '#FF53BA';            // rosa
  if (p < 0.50) return 'rgba(255,255,255,0.75)';
  if (p < 0.68) return '#98FFBC';            // verde lima
  if (p < 0.82) return 'rgba(255,255,255,0.45)';
  return 'rgba(255,255,255,0.25)';
};

const rankWeight = (rank, total) => {
  const p = rank / Math.max(total - 1, 1);
  if (p < 0.1)  return 900;
  if (p < 0.3)  return 700;
  if (p < 0.6)  return 500;
  return 400;
};

const CyberWordCloud = ({ words }) => {
  const [placed, setPlaced]   = useState([]);
  const [width, setWidth]     = useState(0);
  const containerRef = useRef(null);

  // Solo trackear ancho — altura es fija
  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      if (containerRef.current) setWidth(containerRef.current.offsetWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Recomputar layout cuando cambian palabras o ancho
  useEffect(() => {
    if (!words?.length || width < 50) return;

    const sorted = [...words]
      .sort((a, b) => (b.weight || 0) - (a.weight || 0))
      .slice(0, 50);

    const maxW = Math.max(...sorted.map(w => w.weight || 1));
    const minW = Math.min(...sorted.map(w => w.weight || 1));
    const span = maxW - minW || 1;

    // Escala de tamaño: 13-68px. Potencia 0.55 para no aplastar las pequeñas
    const fontSize = ({ weight }) =>
      13 + Math.pow((weight - minW) / span, 0.55) * 55;

    cloud()
      .size([width, H])
      .words(sorted.map(w => ({ text: w.word, size: fontSize(w), weight: w.weight })))
      .padding(5)
      .rotate(() => (Math.random() < 0.3 ? 90 : 0))   // 30% vertical como en la ref
      .font("'Outfit', sans-serif")
      .fontSize(d => d.size)
      .spiral('archimedean')
      .on('end', result => setPlaced(result))
      .start();
  }, [words, width]);

  if (!words?.length) return null;

  const cx = width / 2;
  const cy = H / 2;
  const n  = placed.length;

  return (
    <div className="pwa-card overflow-hidden bg-fg/[0.02] border-fg/5">
      {/* Header */}
      <div className="flex items-center gap-2 px-6 pt-5 pb-2">
        <div className="w-1.5 h-1.5 bg-[#D3C4F6] rounded-full" />
        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-fg/40 italic">
          Word Cloud — Términos más frecuentes
        </span>
      </div>

      {/* SVG canvas */}
      <div ref={containerRef} style={{ width: '100%' }}>
        {width > 0 && (
          <svg
            width={width}
            height={H}
            aria-label="Word cloud de términos frecuentes"
          >
            {placed.map((w, i) => (
              <text
                key={`${w.text}-${i}`}
                textAnchor="middle"
                x={cx + (w.x || 0)}
                y={cy + (w.y || 0)}
                fontSize={w.size}
                fontWeight={rankWeight(i, n)}
                fontFamily="'Outfit', sans-serif"
                fontStyle={i < Math.ceil(n * 0.08) ? 'italic' : 'normal'}
                fill={rankColor(i, n)}
                transform={`rotate(${w.rotate || 0},${cx + (w.x || 0)},${cy + (w.y || 0)})`}
                style={{
                  cursor: 'default',
                  userSelect: 'none',
                  opacity: 0,
                  animation: `wc-fade 0.4s ease forwards ${i * 18}ms`,
                }}
              >
                {(w.text || '').toUpperCase()}
              </text>
            ))}

            {/* Animación CSS inline para el fade-in escalonado */}
            <defs>
              <style>{`
                @keyframes wc-fade {
                  from { opacity: 0; transform-origin: inherit; }
                  to   { opacity: 1; }
                }
              `}</style>
            </defs>
          </svg>
        )}
      </div>
    </div>
  );
};

export default CyberWordCloud;
