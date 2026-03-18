import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

const LandingPage = ({ onEnter }) => (
  <div className="min-h-[80vh] flex flex-col items-center justify-center text-center space-y-12 relative">
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      className="space-y-4"
    >
      <div className="inline-block px-4 py-1.5 bg-accent-orange/10 border border-accent-orange/20 rounded-full text-accent-orange text-[10px] font-black uppercase tracking-[0.3em] mb-4">
        AI-Powered Social Intelligence
      </div>
      <h1 className="text-6xl md:text-8xl font-black italic uppercase tracking-tighter leading-[0.85]">
        Escucha lo que el <br />
        <span className="text-accent-orange">mundo dice de NGR.</span>
      </h1>
      <p className="text-fg/60 dark:text-fg/40 text-lg md:text-xl font-medium max-w-2xl mx-auto italic leading-relaxed">
        Transformamos miles de comentarios de TikTok, Instagram y Google Maps en insights estratégicos accionables para el Directorio.
      </p>
    </motion.div>

    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.8 }}
      className="flex flex-col md:flex-row gap-6 items-center"
    >
      <button
        onClick={onEnter}
        className="pwa-btn px-12 py-5 text-sm group relative overflow-hidden bg-accent-orange text-white dark:bg-accent-orange border-none shadow-[0_10px_40px_rgba(255,126,75,0.3)]"
      >
        <span className="relative z-10 flex items-center gap-3">
          Ingresar al Dashboard
          <ArrowUpRight size={18} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
        </span>
        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
      </button>
      <div className="flex items-center gap-2">
        <div className="flex -space-x-3">
          {[
            'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150&h=150',
            'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=150&h=150',
            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150&h=150',
            'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150&h=150',
          ].map((img, i) => (
            <img key={i} src={img} className="w-10 h-10 rounded-full border-2 border-bg object-cover shadow-sm" alt="User" />
          ))}
        </div>
        <div className="flex items-center ml-2 text-[10px] font-black uppercase tracking-widest text-fg/30 italic">
          +500 Menciones hoy
        </div>
      </div>
    </motion.div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl pt-10">
      {[
        { title: 'Real-time Scrutiny', desc: 'Monitorea cada mención al instante en TikTok e Instagram.' },
        { title: 'IA Analysis', desc: 'Gemini Flash procesa el sentimiento y detecta crisis potenciales.' },
        { title: 'Executive Data', desc: 'Reportes estratégicos listos para el management de NGR.' },
      ].map((f, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 + (i * 0.1) }}
          className="pwa-card p-6 border-fg/10 bg-fg/[0.03] text-left space-y-2 hover:bg-fg/[0.06] transition-all"
        >
          <h3 className="text-xs font-black uppercase italic tracking-widest text-accent-orange">{f.title}</h3>
          <p className="text-xs font-medium text-fg/70 dark:text-fg/40 leading-relaxed">{f.desc}</p>
        </motion.div>
      ))}
    </div>

    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.2, duration: 1 }}
      className="w-full max-w-6xl relative group perspective-1000"
    >
      <div className="absolute inset-0 bg-accent-orange/10 blur-[150px] rounded-full opacity-30 group-hover:opacity-60 transition-opacity duration-1000" />
      <div className="relative rounded-[2.5rem] overflow-hidden border border-fg/10 bg-bg shadow-2xl rotate-x-2 group-hover:rotate-x-0 transition-all duration-1000 flex h-[500px]">
        {/* Mock Sidebar */}
        <div className="w-16 border-r border-fg/5 bg-fg/[0.02] flex-col items-center py-8 gap-8 hidden md:flex">
          <div className="w-8 h-8 rounded-xl bg-accent-orange/20 border border-accent-orange/30 flex items-center justify-center">
            <div className="w-3 h-3 bg-accent-orange rounded-sm" />
          </div>
          <div className="space-y-6 opacity-20">
            {[1, 2, 3, 4].map(i => <div key={i} className="w-6 h-1 bg-fg rounded-full" />)}
          </div>
        </div>

        {/* Mock Main Content */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-8 py-6 border-b border-fg/5">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-accent-pink" />
                <div className="w-2 h-2 rounded-full bg-accent-lemon" />
                <div className="w-2 h-2 rounded-full bg-accent-orange" />
              </div>
              <span className="text-[9px] font-black uppercase tracking-[0.3em] text-fg/20 ml-4">NGR Intelligence Suite</span>
            </div>
            <div className="px-4 py-1.5 bg-fg/5 rounded-lg text-[8px] font-black uppercase tracking-widest text-accent-lemon border border-accent-lemon/20">
              Live: Data Stream Active
            </div>
          </div>

          <div className="p-8 flex-1 flex flex-col gap-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="pwa-card p-6 bg-fg/[0.03] border-fg/5 space-y-3">
                <p className="text-[9px] font-black uppercase text-fg/20 tracking-[0.2em]">Portfolio Growth</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black italic">+24.8%</span>
                  <span className="text-[10px] text-accent-lemon font-bold">▲ Global</span>
                </div>
                <div className="h-1 w-full bg-fg/5 rounded-full">
                  <motion.div initial={{ width: 0 }} animate={{ width: '75%' }} transition={{ duration: 2, delay: 1.5 }} className="h-full bg-accent-lemon shadow-[0_0_10px_rgba(152,255,188,0.3)]" />
                </div>
              </div>
              <div className="pwa-card p-6 bg-fg/[0.03] border-fg/5 space-y-3">
                <p className="text-[9px] font-black uppercase text-fg/20 tracking-[0.2em]">Net Sentiment Score</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black italic text-accent-orange">8.2</span>
                  <span className="text-[10px] text-fg/40 font-bold">/ 10.0</span>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
                    <div key={i} className={`h-4 w-1.5 rounded-sm ${i <= 8 ? 'bg-accent-orange' : 'bg-fg/5'}`} />
                  ))}
                </div>
              </div>
              <div className="pwa-card p-6 bg-fg/[0.03] border-fg/5 flex flex-col justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase text-fg/20 tracking-[0.2em]">Critical Alerts</p>
                  <p className="text-4xl font-black italic text-fg/10 uppercase">None</p>
                </div>
                <div className="flex items-center gap-2 text-[8px] font-black text-accent-lemon uppercase tracking-tighter">
                  <div className="w-1 h-1 bg-accent-lemon rounded-full animate-ping" />
                  System fully operational
                </div>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 min-h-0">
              <div className="md:col-span-8 pwa-card bg-fg/[0.02] border-fg/5 p-6 relative overflow-hidden flex items-end justify-between gap-2 h-full">
                <div className="absolute top-6 left-6">
                  <h4 className="text-[9px] font-black uppercase tracking-widest text-fg/30">Engagement Volatility</h4>
                  <p className="text-xs font-bold text-fg/60 pt-1">Real-time aggregate mention flux</p>
                </div>
                {[40, 70, 45, 90, 65, 80, 50, 85, 30, 95, 60, 75].map((h, i) => (
                  <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${h}%` }}
                    transition={{ delay: 1.5 + (i * 0.05), duration: 1, ease: 'easeOut' }}
                    className={`flex-1 rounded-t-lg transition-all duration-500 hover:scale-x-110 cursor-pointer ${i === 9 ? 'bg-gradient-to-t from-accent-orange to-accent-pink shadow-[0_0_20px_rgba(255,126,75,0.4)]' : 'bg-fg/10'}`}
                  />
                ))}
              </div>
              <div className="md:col-span-4 pwa-card bg-fg/[0.02] border-fg/5 p-6 space-y-4 h-full">
                <h4 className="text-[9px] font-black uppercase tracking-widest text-fg/30">Sentiment Clusters</h4>
                <div className="space-y-3">
                  {[
                    { label: 'Sabor & Calidad', val: 85, color: 'accent-lemon' },
                    { label: 'Tiempo de Entrega', val: 42, color: 'accent-orange' },
                    { label: 'Atención Local', val: 78, color: 'accent-lemon' },
                  ].map(c => (
                    <div key={c.label} className="space-y-1">
                      <div className="flex justify-between text-[8px] font-black uppercase tracking-tighter opacity-60 text-fg">
                        <span>{c.label}</span>
                        <span>{c.val}%</span>
                      </div>
                      <div className="h-1 w-full bg-fg/5 rounded-full overflow-hidden">
                        <div className={`h-full bg-${c.color}`} style={{ width: `${c.val}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-4 border-t border-fg/5">
                  <p className="text-[8px] font-medium text-fg/20 italic">Clustering basado en Gemini Flash 1.5</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  </div>
);

export default LandingPage;
