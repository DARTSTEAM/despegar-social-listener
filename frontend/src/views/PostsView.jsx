import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE } from '../config';
import CustomDropdown from '../components/CustomDropdown';
import { X, ExternalLink, ThumbsUp, ThumbsDown, Eye, MessageCircle, Heart, TrendingUp } from 'lucide-react';

// ── helpers ────────────────────────────────────────────────────────────────────
const sentimentBar = (pos, neg) => {
  const total = pos + neg || 1;
  return { pos: Math.round((pos / total) * 100), neg: Math.round((neg / total) * 100) };
};

const platformBadge = {
  tiktok:    'bg-white/10 text-white border-white/10',
  instagram: 'bg-accent-pink/10 text-accent-pink border-accent-pink/20',
};

const fmt = n => {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

const sentimentLabel = s => ({
  very_positive: { label: 'Muy Pos',  cls: 'text-accent-lemon bg-accent-lemon/10 border-accent-lemon/20' },
  positive:      { label: 'Pos',      cls: 'text-accent-lemon bg-accent-lemon/10 border-accent-lemon/20' },
  neutral:       { label: 'Neutral',  cls: 'text-fg/40 bg-fg/5 border-fg/10' },
  negative:      { label: 'Neg',      cls: 'text-accent-pink bg-accent-pink/10 border-accent-pink/20' },
  very_negative: { label: 'Muy Neg',  cls: 'text-accent-pink bg-accent-pink/10 border-accent-pink/20' },
})[s] || { label: s, cls: 'text-fg/30 bg-fg/5 border-fg/10' };

// ── PostCard ───────────────────────────────────────────────────────────────────
const PostCard = ({ post, rank, type, selected, onClick }) => {
  const pos = post.sentiment?.positive || 0;
  const neg = post.sentiment?.negative || 0;
  const bar = sentimentBar(pos, neg);

  return (
    <div
      onClick={onClick}
      className={`pwa-card overflow-hidden group cursor-pointer transition-all duration-200
        ${selected
          ? 'border-[#9B72F5]/60 bg-[#9B72F5]/5 shadow-[0_0_0_1px_rgba(155,114,245,0.3)]'
          : 'hover:border-fg/20 hover:bg-fg/[0.03]'}`}
    >
      <div className="flex gap-0">
        {/* Thumbnail */}
        <div className="relative w-[84px] h-[110px] flex-shrink-0 bg-fg/5 overflow-hidden">
          {post.thumbnailUrl ? (
            <img
              src={post.thumbnailUrl}
              alt="thumbnail"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-fg/10 text-2xl">
              {post.platform === 'tiktok' ? '▶' : '▫'}
            </div>
          )}
          <div className={`absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black
            ${type === 'best' ? 'bg-accent-lemon text-black' : 'bg-accent-pink text-white'}`}>
            {rank}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 p-3 min-w-0 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[8px] font-black uppercase tracking-widest text-fg/30">{post.brand}</span>
              <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase border ${platformBadge[post.platform] || 'bg-fg/10 text-fg/40 border-fg/10'}`}>
                {post.platform}
              </span>
            </div>
            <p className="text-[10px] text-fg/55 italic leading-snug line-clamp-2">
              {post.description || '(Sin descripción)'}
            </p>
          </div>

          <div className="space-y-1.5 mt-1">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1 bg-fg/5 rounded-full overflow-hidden flex">
                <div className="h-full bg-accent-lemon" style={{ width: `${bar.pos}%` }} />
                <div className="h-full bg-accent-pink"  style={{ width: `${bar.neg}%` }} />
              </div>
              <span className={`text-[9px] font-black ${type === 'best' ? 'text-accent-lemon' : 'text-accent-pink'}`}>
                {type === 'best' ? `+${pos}%` : `-${neg}%`}
              </span>
            </div>
            <div className="flex gap-3">
              {post.likes        > 0 && <span className="text-[8px] text-fg/30 font-bold">❤ {fmt(post.likes)}</span>}
              {post.views        > 0 && <span className="text-[8px] text-fg/30 font-bold">▶ {fmt(post.views)}</span>}
              {post.commentCount > 0 && <span className="text-[8px] text-fg/30 font-bold">💬 {post.commentCount}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── PostDetail panel ───────────────────────────────────────────────────────────
const PostDetail = ({ post, onClose }) => {
  const [scanComments, setScanComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);

  // Fetch comentarios del scan correspondiente a este post (brand+platform+date)
  useEffect(() => {
    let cancelled = false;
    const fetchComments = async () => {
      setLoadingComments(true);
      setScanComments([]);
      try {
        const params = { brand: post.brand, platform: post.platform };
        if (post.date) params.date = post.date;
        const { data } = await axios.get(`${API_BASE}/api/scan-comments`, { params });
        if (!cancelled) setScanComments(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setScanComments([]);
      } finally {
        if (!cancelled) setLoadingComments(false);
      }
    };
    fetchComments();
    return () => { cancelled = true; };
  }, [post.id, post.brand, post.platform, post.date]);

  const pos  = post.sentiment?.positive      || 0;
  const neg  = post.sentiment?.negative      || 0;
  const neu  = post.sentiment?.neutral       || 0;
  const vpos = post.sentiment?.very_positive || 0;
  const vneg = post.sentiment?.very_negative || 0;

  const bar    = sentimentBar(pos, neg);
  const topPos = scanComments.filter(c => ['positive','very_positive'].includes(c.sentiment)).slice(0, 3);
  const topNeg = scanComments.filter(c => ['negative','very_negative'].includes(c.sentiment)).slice(0, 3);

  const engagementRate = post.views > 0
    ? (((post.likes || 0) + (post.commentCount || 0)) / post.views * 100).toFixed(2)
    : null;

  const sentBars = [
    { label: 'Muy Positivo', value: vpos, color: 'bg-accent-lemon/80' },
    { label: 'Positivo',     value: pos,  color: 'bg-accent-lemon' },
    { label: 'Neutral',      value: neu,  color: 'bg-fg/20' },
    { label: 'Negativo',     value: neg,  color: 'bg-accent-pink' },
    { label: 'Muy Negativo', value: vneg, color: 'bg-accent-pink/70' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="pwa-card bg-fg/[0.02] border-fg/8 sticky top-4 space-y-5 overflow-y-auto max-h-[calc(100vh-6rem)]"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-5 pb-0">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[8px] font-black uppercase tracking-widest text-fg/30">{post.brand}</span>
            <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase border ${platformBadge[post.platform] || ''}`}>
              {post.platform}
            </span>
            {post.date && (
              <span className="text-[7px] text-fg/20 font-bold">{post.date}</span>
            )}
          </div>
          <p className="text-[11px] text-fg/70 italic leading-snug line-clamp-3">{post.description || '(Sin descripción)'}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {post.url && (
            <a href={post.url} target="_blank" rel="noreferrer"
              className="p-1.5 rounded-lg bg-fg/5 hover:bg-fg/10 transition-all">
              <ExternalLink size={12} className="text-fg/40" />
            </a>
          )}
          <button onClick={onClose} className="p-1.5 rounded-lg bg-fg/5 hover:bg-fg/10 transition-all">
            <X size={12} className="text-fg/40" />
          </button>
        </div>
      </div>

      {/* Thumbnail */}
      {post.thumbnailUrl && (
        <div className="px-5">
          <div className="rounded-xl overflow-hidden aspect-video bg-fg/5">
            <img src={post.thumbnailUrl} alt="thumbnail" className="w-full h-full object-cover" />
          </div>
        </div>
      )}

      <div className="px-5 space-y-5 pb-5">
        {/* Métricas del post individual */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: Heart,         value: fmt(post.likes),        label: 'Likes'      },
            { icon: Eye,           value: fmt(post.views),        label: 'Views'      },
            { icon: MessageCircle, value: fmt(post.commentCount), label: 'Comentarios'},
            { icon: TrendingUp,    value: engagementRate ? `${engagementRate}%` : '—', label: 'Engagement' },
          ].map(({ icon: Icon, value, label }) => (
            <div key={label} className="p-3 bg-fg/[0.03] rounded-xl border border-fg/5 space-y-1">
              <div className="flex items-center gap-1.5">
                <Icon size={10} className="text-fg/25" />
                <span className="text-[8px] font-black uppercase tracking-widest text-fg/25">{label}</span>
              </div>
              <p className="text-lg font-black italic text-fg">{value || '—'}</p>
            </div>
          ))}
        </div>

        {/* Sentiment breakdown — del scan de la cuenta ese día */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-fg/30">Sentiment del scan</p>
              <p className="text-[7px] text-fg/20 italic">{post.brand} · {post.platform} · {post.date || 'último scan'}</p>
            </div>
            <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border ${bar.pos > bar.neg ? 'text-accent-lemon border-accent-lemon/20 bg-accent-lemon/10' : 'text-accent-pink border-accent-pink/20 bg-accent-pink/10'}`}>
              {bar.pos > bar.neg ? `+${pos}% pos` : `-${neg}% neg`}
            </span>
          </div>
          <div className="h-2 w-full bg-fg/5 rounded-full overflow-hidden flex">
            <div className="h-full bg-accent-lemon transition-all" style={{ width: `${bar.pos}%` }} />
            <div className="h-full bg-accent-pink transition-all"  style={{ width: `${bar.neg}%` }} />
          </div>
          <div className="space-y-2">
            {sentBars.map(({ label, value, color }) => (
              <div key={label} className="space-y-0.5">
                <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                  <span className="text-fg/30">{label}</span>
                  <span className="text-fg/50">{value}%</span>
                </div>
                <div className="h-1 w-full bg-fg/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${value}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className={`h-full rounded-full ${color}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Comentarios del scan */}
        <div className="space-y-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-fg/30">
            Comentarios del scan
            <span className="text-fg/15 font-normal normal-case tracking-normal ml-1">({post.brand} · {post.date || 'último'})</span>
          </p>

          {loadingComments && (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-10 rounded-xl bg-fg/[0.03] animate-pulse" />)}
            </div>
          )}

          {!loadingComments && topPos.length > 0 && (
            <div className="space-y-2">
              <p className="text-[8px] font-black uppercase tracking-widest text-accent-lemon/60">💚 Positivos</p>
              {topPos.map((c, i) => (
                <div key={i} className="p-2.5 bg-accent-lemon/[0.04] border border-accent-lemon/10 rounded-xl space-y-0.5">
                  <p className="text-[8px] font-black uppercase text-accent-lemon/50">@{c.author}</p>
                  <p className="text-[10px] text-fg/60 italic leading-snug">"{c.text_preview || c.message}"</p>
                </div>
              ))}
            </div>
          )}

          {!loadingComments && topNeg.length > 0 && (
            <div className="space-y-2">
              <p className="text-[8px] font-black uppercase tracking-widest text-accent-pink/60">⚠ Negativos</p>
              {topNeg.map((c, i) => (
                <div key={i} className="p-2.5 bg-accent-pink/[0.04] border border-accent-pink/10 rounded-xl space-y-0.5">
                  <p className="text-[8px] font-black uppercase text-accent-pink/50">@{c.author}</p>
                  <p className="text-[10px] text-fg/60 italic leading-snug">"{c.text_preview || c.message}"</p>
                </div>
              ))}
            </div>
          )}

          {!loadingComments && scanComments.length === 0 && (
            <p className="text-[9px] text-fg/20 italic text-center py-2">Sin comentarios analizados para esta cuenta</p>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ── PostsView ──────────────────────────────────────────────────────────────────

const PostsView = () => {
  const [posts, setPosts]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [brandFilter, setBrand]       = useState('');
  const [platformFilter, setPlatform] = useState('');
  const [tab, setTab]                 = useState('best');
  const [selected, setSelected]       = useState(null);

  const brandOptions    = [{ value: '', label: 'Todas las marcas' }, ...['Despegar','Despegar AR','Turismo City','Booking','Airbnb'].map(b => ({ value: b, label: b }))];
  const platformOptions = [{ value: '', label: 'Todas las plataformas' }, { value: 'tiktok', label: 'TikTok' }, { value: 'instagram', label: 'Instagram' }];

  const fetchPosts = async () => {
    setLoading(true); setError(null);
    try {
      const params = { sort: tab, limit: 30 };
      if (brandFilter)    params.brand    = brandFilter;
      if (platformFilter) params.platform = platformFilter;
      const { data } = await axios.get(`${API_BASE}/api/posts`, { params });
      setPosts(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPosts(); }, [tab, brandFilter, platformFilter]);
  useEffect(() => { setSelected(null); }, [tab, brandFilter, platformFilter]);

  const best    = posts.filter(p => (p.sentiment?.positive || 0) - (p.sentiment?.negative || 0) > 0).slice(0, 15);
  const worst   = posts.filter(p => (p.sentiment?.negative || 0) > 0).slice(0, 15);
  const display = tab === 'best' ? best : worst;

  const handleSelect = (post) => setSelected(prev => prev?.id === post.id ? null : post);

  return (
    <section className="space-y-8 pb-20">
      <header className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-bold text-fg/20 uppercase tracking-widest mb-2">Ranking por Sentimiento</p>
          <h1 className="pwa-title leading-tight text-fg">
            Posts <br />
            <span className="text-accent-lemon font-black tracking-tighter uppercase italic">Performance</span>
          </h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {[
            { key: 'best',  label: '🏆 Mejor sentimiento' },
            { key: 'worst', label: '⚠ Peor sentimiento'  },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all
                ${tab === key
                  ? key === 'best' ? 'bg-accent-lemon text-black border-accent-lemon' : 'bg-accent-pink text-white border-accent-pink'
                  : 'bg-fg/5 border-fg/10 text-fg/40 hover:bg-fg/10'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex gap-4 flex-wrap">
          <CustomDropdown label="Marca"     options={brandOptions}    value={brandFilter}    onChange={setBrand}    />
          <CustomDropdown label="Plataforma" options={platformOptions} value={platformFilter} onChange={setPlatform} />
        </div>
      </header>

      {error && (
        <div className="pwa-card p-4 border-accent-pink/50 bg-accent-pink/10 text-accent-pink text-[10px] font-black italic uppercase tracking-widest">
          {posts.length === 0 && !loading
            ? 'No hay posts aún — ejecutá el scraper masivo para generar datos de posts por video'
            : `Error: ${error}`}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="pwa-card h-[110px] animate-pulse bg-fg/[0.02]" />
          ))}
        </div>
      ) : display.length === 0 ? (
        <div className="pwa-card p-12 text-center space-y-4 bg-fg/[0.01]">
          <div className="text-4xl opacity-20">{tab === 'best' ? '🏆' : '⚠'}</div>
          <p className="text-sm font-black text-fg/20 uppercase tracking-widest">
            {tab === 'best' ? 'No hay posts positivos aún' : 'No hay posts con sentimiento negativo'}
          </p>
          <p className="text-[10px] text-fg/20">
            Ejecutá el scraper masivo en Ajustes para generar datos por video/post
          </p>
        </div>
      ) : (
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-fg/20 mb-4">
            {display.length} posts — {selected ? 'click para deseleccionar' : 'click para ver detalle'}
          </p>

          {/* Layout: grid de posts + panel sticky */}
          <div className={`flex gap-6 items-start transition-all duration-300`}>
            {/* Lista de posts */}
            <div className={`grid gap-3 transition-all duration-300 ${selected ? 'grid-cols-1 flex-[2]' : 'grid-cols-1 md:grid-cols-2 flex-1'}`}>
              {display.map((post, i) => (
                <PostCard
                  key={post.id || i}
                  post={post}
                  rank={i + 1}
                  type={tab}
                  selected={selected?.id === post.id}
                  onClick={() => handleSelect(post)}
                />
              ))}
            </div>

            {/* Panel de detalle */}
            <AnimatePresence mode="wait">
              {selected && (
                <div key={selected.id} className="flex-[1.2] min-w-[280px] max-w-[400px]">
                  <PostDetail key={selected.id} post={selected} onClose={() => setSelected(null)} />
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </section>
  );
};

export default PostsView;
