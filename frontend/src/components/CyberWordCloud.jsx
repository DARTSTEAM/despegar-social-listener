import { useState, useEffect, useRef } from 'react';
import cloud from 'd3-cloud';
import { motion, AnimatePresence } from 'framer-motion';

const CyberWordCloud = ({ words }) => {
  const [layout, setLayout] = useState([]);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (containerRef.current) {
      const updateSize = () => {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      };
      updateSize();
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }
  }, []);

  useEffect(() => {
    if (!words || !words.length || dimensions.width === 0) return;

    const sortedWords = [...words]
      .sort((a, b) => (b.weight || 0) - (a.weight || 0))
      .slice(0, 45);

    const maxWeight = Math.max(...sortedWords.map(w => w.weight || 10));
    const minWeight = Math.min(...sortedWords.map(w => w.weight || 10));

    const layoutEngine = cloud()
      .size([dimensions.width - 20, dimensions.height - 20])
      .words(sortedWords.map(w => ({
        text: w.word.toUpperCase(),
        size: 10 + (Math.sqrt((w.weight - minWeight) / (maxWeight - minWeight || 1)) * 90),
        rawWeight: w.weight
      })))
      .padding(4)
      .rotate(0)
      .font("'Outfit', sans-serif")
      .fontSize(d => d.size)
      .spiral('rectangular')
      .on('end', (computedWords) => setLayout(computedWords));

    layoutEngine.start();
  }, [words, dimensions]);

  if (!words || !words.length) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-[550px] relative overflow-hidden group w-full p-1 rounded-[3rem] bg-gradient-to-b from-fg/[0.03] to-transparent border border-fg/10 shadow-inner">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--accent-pink)_0%,transparent_70%)] opacity-[0.03] pointer-events-none" />

      <div className="absolute top-8 left-10 flex flex-col gap-1 z-10 select-none">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-accent-pink rounded-full shadow-[0_0_12px_rgba(255,0,128,0.8)]" />
          <h3 className="text-[10px] font-black uppercase text-fg/80 tracking-[0.25em] italic">Semantic Intelligence</h3>
        </div>
        <p className="text-[9px] font-medium text-fg/20 uppercase tracking-widest pl-3.5 italic">Consumer Sentiment Mapping</p>
      </div>

      <div ref={containerRef} className="w-full h-[450px] relative z-20">
        <AnimatePresence>
          {layout.map((w, i) => {
            const importance = (w.size - 10) / 90;
            let color = 'text-fg/40';
            let glow = '';
            let weight = 'font-medium';

            if (importance > 0.85) {
              color = 'text-accent-pink';
              glow = 'drop-shadow-[0_0_20px_rgba(255,0,128,0.5)]';
              weight = 'font-black italic underline decoration-accent-pink/20 underline-offset-4';
            } else if (importance > 0.6) {
              color = 'text-fg/100';
              weight = 'font-black';
            } else if (importance > 0.35) {
              color = 'text-fg/70';
              weight = 'font-bold';
            }

            return (
              <motion.div
                key={`${w.text}-${i}`}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{
                  opacity: 1, scale: 1,
                  y: [0, Math.sin(i * 10) * 8, 0],
                  x: [0, Math.cos(i * 10) * 8, 0]
                }}
                whileHover={{ scale: 1.15, color: '#ff0080', zIndex: 100 }}
                transition={{
                  delay: i * 0.005,
                  duration: 0.5,
                  y: { duration: 5 + Math.random() * 3, repeat: Infinity, ease: 'easeInOut' },
                  x: { duration: 6 + Math.random() * 3, repeat: Infinity, ease: 'easeInOut' }
                }}
                className={`absolute cursor-default select-none ${color} ${weight} ${glow} leading-none tracking-tighter`}
                style={{
                  left: `${dimensions.width / 2 + w.x}px`,
                  top: `${dimensions.height / 2 + w.y}px`,
                  fontSize: `${w.size}px`,
                  transform: 'translate(-50%, -50%)',
                  whiteSpace: 'nowrap'
                }}
              >
                {w.text}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div className="absolute bottom-8 right-12 z-10 flex items-center gap-4">
        <div className="h-px w-20 bg-gradient-to-l from-accent-pink/40 to-transparent" />
        <span className="text-[10px] font-black uppercase text-accent-pink/40 tracking-[0.4em]">Engine Alpha</span>
      </div>
    </div>
  );
};

export default CyberWordCloud;
