import { ThumbsUp, ThumbsDown, Minus } from 'lucide-react';

const SentimentPill = ({ type, count }) => {
  const colors = {
    positive: 'text-accent-lemon bg-fg/[0.03] dark:bg-white/5',
    negative: 'text-accent-pink bg-fg/[0.03] dark:bg-white/5',
    neutral:  'text-fg/40 bg-fg/[0.03] dark:bg-white/5',
  };
  const Icons = { positive: ThumbsUp, negative: ThumbsDown, neutral: Minus };
  const Icon = Icons[type];

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border border-fg/10 ${colors[type]}`}>
      <Icon size={12} />
      <span className="text-[10px] font-black uppercase tracking-widest">{count}</span>
    </div>
  );
};

export default SentimentPill;
