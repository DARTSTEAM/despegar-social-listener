import { useState, useEffect, useRef } from 'react';
import cloud from 'd3-cloud';

const H = 500;

// Color por rango de frecuencia
const rankColor = (i, n) => {
  const p = i / Math.max(n - 1, 1);
  if (p < 0.06) return '#D3C4F6';
  if (p < 0.15) return '#ffffff';
  if (p < 0.28) return '#FF53BA';
  if (p < 0.45) return 'rgba(255,255,255,0.80)';
  if (p < 0.60) return '#98FFBC';
  if (p < 0.75) return 'rgba(255,255,255,0.50)';
  return 'rgba(255,255,255,0.28)';
};

const rankWeight = (i, n) => {
  const p = i / Math.max(n - 1, 1);
  if (p < 0.08) return 900;
  if (p < 0.25) return 700;
  if (p < 0.55) return 500;
  return 400;
};

const CyberWordCloud = ({ words }) => {
  const [placed, setPlaced]  = useState([]);
  const [width, setWidth]    = useState(0);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => containerRef.current && setWidth(containerRef.current.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!words?.length || width < 50) return;
    setPlaced([]); // reset mientras recalcula

    const sorted = [...words]
      .sort((a, b) => (b.weight || 0) - (a.weight || 0))
      .slice(0, 65);

    const maxW = Math.max(...sorted.map(w => w.weight || 1));
    const minW = Math.min(...sorted.map(w => w.weight || 1));
    const span = maxW - minW || 1;

    // Fuentes: 13-44px. Tamaño moderado para que d3-cloud pueda resolver el layout
    const fontSize = ({ weight }) =>
      13 + Math.pow((weight - minW) / span, 0.6) * 31;

    cloud()
      .size([width, H])
      .words(sorted.map(w => ({ text: w.word, size: fontSize(w), weight: w.weight })))
      .padding(6)
      .rotate(() => (Math.random() < 0.28 ? 90 : 0))
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
      <div className="flex items-center gap-2 px-6 pt-5 pb-1">
        <div className="w-1.5 h-1.5 bg-[#D3C4F6] rounded-full" />
        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-fg/40 italic">
          Word Cloud — Términos más frecuentes
        </span>
      </div>

      <div ref={containerRef} style={{ width: '100%' }}>
        {width > 0 && (
          <svg width={width} height={H} aria-label="Word cloud">
            <g transform={`translate(${cx},${cy})`}>
              {placed.map((w, i) => (
                <text
                  key={`${w.text}-${i}`}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  x={w.x || 0}
                  y={w.y || 0}
                  fontSize={w.size}
                  fontWeight={rankWeight(i, n)}
                  fontFamily="'Outfit', sans-serif"
                  fontStyle={i < Math.ceil(n * 0.07) ? 'italic' : 'normal'}
                  fill={rankColor(i, n)}
                  transform={`rotate(${w.rotate || 0})`}
                  style={{ cursor: 'default', userSelect: 'none' }}
                  opacity={0.92}
                >
                  {(w.text || '').toUpperCase()}
                </text>
              ))}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
};

export default CyberWordCloud;
