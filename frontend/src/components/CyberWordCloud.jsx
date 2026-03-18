import { useState, useEffect, useRef } from 'react';
import cloud from 'd3-cloud';
import { motion, AnimatePresence } from 'framer-motion';

// Paleta: lavanda (owned), blanco, rosa (negativo), verde lima (positivo), grises
const COLOR_BANDS = [
  { min: 0.85, color: '#D3C4F6', weight: 900, italic: true  },  // muy frecuente → lavanda
  { min: 0.65, color: '#ffffff', weight: 800, italic: false },  // frecuente → blanco
  { min: 0.45, color: '#FF53BA', weight: 700, italic: false },  // medio-alto → rosa
  { min: 0.25, color: 'rgba(255,255,255,0.55)', weight: 600, italic: false },
  { min: 0,    color: 'rgba(255,255,255,0.28)', weight: 400, italic: false },
];

function getColor(importance) {
  for (const band of COLOR_BANDS) {
    if (importance >= band.min) return band;
  }
  return COLOR_BANDS[COLOR_BANDS.length - 1];
}

const CyberWordCloud = ({ words }) => {
  const [layout, setLayout] = useState([]);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Observar tamaño del contenedor
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => setDimensions({ width: el.offsetWidth, height: el.offsetHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Generar layout con d3-cloud
  useEffect(() => {
    if (!words?.length || dimensions.width < 10) return;

    const sorted = [...words]
      .sort((a, b) => (b.weight || 0) - (a.weight || 0))
      .slice(0, 60);

    const maxW = Math.max(...sorted.map(w => w.weight || 1));
    const minW = Math.min(...sorted.map(w => w.weight || 1));
    const range = maxW - minW || 1;

    // Tamaño: escala cuadrática entre 12 y 96px
    const fontSize = w => 12 + Math.pow((w.weight - minW) / range, 0.55) * 84;

    // Rotaciones: 0° o 90° (como en la imagen de referencia)
    const rotate = () => (Math.random() < 0.35 ? 90 : 0);

    cloud()
      .size([dimensions.width, dimensions.height])
      .words(sorted.map(w => ({ text: w.word, size: fontSize(w), weight: w.weight })))
      .padding(5)
      .rotate(rotate)
      .font("'Outfit', sans-serif")
      .fontSize(d => d.size)
      .spiral('archimedean')
      .on('end', computed => setLayout(computed))
      .start();
  }, [words, dimensions]);

  if (!words?.length) return null;

  const maxW = Math.max(...(layout.map(w => w.weight || 1)));
  const minW = Math.min(...(layout.map(w => w.weight || 1)));
  const range = maxW - minW || 1;

  return (
    <div className="pwa-card overflow-hidden relative bg-fg/[0.02] border-fg/5" style={{ minHeight: 480 }}>
      {/* Label */}
      <div className="absolute top-5 left-6 z-10 flex items-center gap-2">
        <div className="w-1.5 h-1.5 bg-[#D3C4F6] rounded-full" />
        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-fg/40 italic">Word Cloud — Términos más frecuentes</span>
      </div>

      {/* Canvas */}
      <div ref={containerRef} style={{ width: '100%', height: 480, position: 'relative' }}>
        <svg
          width={dimensions.width}
          height={480}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          <AnimatePresence>
            {layout.map((w, i) => {
              const importance = ((w.weight || 0) - minW) / range;
              const band = getColor(importance);

              return (
                <motion.text
                  key={`${w.text}-${i}`}
                  textAnchor="middle"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.012 }}
                  whileHover={{ scale: 1.18 }}
                  x={dimensions.width / 2 + (w.x || 0)}
                  y={480 / 2 + (w.y || 0)}
                  fontSize={w.size}
                  fontWeight={band.weight}
                  fontFamily="'Outfit', sans-serif"
                  fontStyle={band.italic ? 'italic' : 'normal'}
                  fill={band.color}
                  transform={`rotate(${w.rotate || 0}, ${dimensions.width / 2 + (w.x || 0)}, ${480 / 2 + (w.y || 0)})`}
                  style={{ cursor: 'default', userSelect: 'none' }}
                >
                  {w.text?.toUpperCase()}
                </motion.text>
              );
            })}
          </AnimatePresence>
        </svg>
      </div>
    </div>
  );
};

export default CyberWordCloud;
