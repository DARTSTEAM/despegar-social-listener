import { motion } from 'framer-motion';

const ShareOfVoiceChart = ({ data }) => {
  const total = data.reduce((acc, b) => acc + b.count, 0) || 100;

  return (
    <div className="pwa-card p-6 flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-fg/50">Share of Voice</h3>
        <span className="text-[11px] font-black uppercase text-accent-orange italic">Consolidated</span>
      </div>
      <div className="h-4 w-full flex rounded-full overflow-hidden bg-fg/5">
        {data.map((b, i) => (
          <motion.div
            key={i}
            initial={{ width: 0 }}
            animate={{ width: `${(b.count / total) * 100}%` }}
            style={{ backgroundColor: b.color }}
            className="h-full relative group"
          >
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity bg-fg text-bg border border-fg/10 px-2 py-1 rounded text-[10px] font-black uppercase z-20 whitespace-nowrap">
              {b.name}: {Math.round((b.count / total) * 100)}%
            </div>
          </motion.div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {data.map((b, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: b.color }} />
            <span className="text-[11px] font-black uppercase tracking-tighter text-fg/40">{b.name}</span>
            <span className="text-[11px] font-black text-fg ml-auto">{Math.round((b.count / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ShareOfVoiceChart;
