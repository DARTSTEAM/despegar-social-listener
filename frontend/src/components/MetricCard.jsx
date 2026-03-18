import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

const MetricCard = ({ title, value, change, icon: Icon }) => (
  <motion.div whileHover={{ y: -4 }} className="pwa-card p-6 flex flex-col gap-4">
    <div className="flex justify-between items-start">
      <div className="p-2 bg-fg/5 rounded-lg">
        <Icon size={18} className="text-accent-orange" />
      </div>
      <div className="flex items-center gap-1 text-accent-lemon text-[10px] font-bold">
        <ArrowUpRight size={10} />
        {change}%
      </div>
    </div>
    <div>
      <p className="text-[10px] text-fg/60 dark:text-fg/50 font-black uppercase tracking-widest mb-1">{title}</p>
      <p className="text-3xl font-black italic text-fg">{value}</p>
    </div>
  </motion.div>
);

export default MetricCard;
