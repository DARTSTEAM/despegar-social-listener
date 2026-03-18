import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../config';
import CustomDropdown from '../components/CustomDropdown';

const sentimentBar = (pos, neg) => {
  const total = pos + neg || 1;
  return { pos: Math.round((pos / total) * 100), neg: Math.round((neg / total) * 100) };
};

const platformBadge = {
  tiktok:    'bg-white/10 text-white border-white/10',
  instagram: 'bg-accent-pink/10 text-accent-pink border-accent-pink/20',
};

const PostCard = ({ post, rank, type }) => {
  const pos = post.sentiment?.positive || 0;
  const neg = post.sentiment?.negative || 0;
  const bar = sentimentBar(pos, neg);
  const isVideo = post.platform === 'tiktok';

  return (
    <div className="pwa-card overflow-hidden group hover:border-fg/20 transition-all">
      <div className="flex gap-0">
        {/* Thumbnail */}
        <div className="relative w-[90px] h-[120px] flex-shrink-0 bg-fg/5 overflow-hidden">
          {post.thumbnailUrl ? (
            <img
              src={post.thumbnailUrl}
              alt="thumbnail"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-fg/10 text-3xl">
              {isVideo ? '▶' : '▫'}
            </div>
          )}
          {/* Rank badge */}
          <div className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black
            ${type === 'best' ? 'bg-accent-lemon text-black' : 'bg-accent-pink text-white'}`}>
            {rank}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 p-4 min-w-0 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[8px] font-black uppercase tracking-widest text-fg/30">{post.brand}</span>
              <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase border ${platformBadge[post.platform] || 'bg-fg/10 text-fg/40 border-fg/10'}`}>
                {post.platform}
              </span>
            </div>
            <p className="text-[11px] text-fg/60 italic leading-snug line-clamp-2">
              {post.description || '(Sin descripción)'}
            </p>
          </div>

          <div className="space-y-1.5 mt-2">
            {/* Sentiment bar */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1 bg-fg/5 rounded-full overflow-hidden flex">
                <div className="h-full bg-accent-lemon" style={{ width: `${bar.pos}%` }} />
                <div className="h-full bg-accent-pink" style={{ width: `${bar.neg}%` }} />
              </div>
              <span className={`text-[9px] font-black ${type === 'best' ? 'text-accent-lemon' : 'text-accent-pink'}`}>
                {type === 'best' ? `+${pos}%` : `-${neg}%`}
              </span>
            </div>

            {/* Stats */}
            <div className="flex gap-3">
              {post.likes > 0 && <span className="text-[8px] text-fg/30 font-bold">❤ {(post.likes/1000).toFixed(1)}k</span>}
              {post.views > 0 && <span className="text-[8px] text-fg/30 font-bold">▶ {(post.views/1000).toFixed(1)}k</span>}
              {post.commentCount > 0 && <span className="text-[8px] text-fg/30 font-bold">💬 {post.commentCount}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const PostsView = () => {
  const [posts, setPosts]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [brandFilter, setBrand]   = useState('');
  const [platformFilter, setPlatform] = useState('');
  const [tab, setTab]             = useState('best'); // 'best' | 'worst'

  const brandOptions    = [{ value: '', label: 'Todas las marcas' }, ...['Despegar','Despegar AR','Turismo City','Booking','Airbnb'].map(b => ({ value: b, label: b }))];
  const platformOptions = [{ value: '', label: 'Todas las plataformas' }, { value: 'tiktok', label: 'TikTok' }, { value: 'instagram', label: 'Instagram' }];

  const fetchPosts = async () => {
    setLoading(true);
    setError(null);
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

  const best  = posts.filter(p => (p.sentiment?.positive || 0) - (p.sentiment?.negative || 0) > 0).slice(0, 15);
  const worst = posts.filter(p => (p.sentiment?.negative || 0) > 0).slice(0, 15);
  const display = tab === 'best' ? best : worst;

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
            { key: 'best',  label: '🏆 Mejor sentimiento', color: 'accent-lemon' },
            { key: 'worst', label: '⚠ Peor sentimiento',  color: 'accent-pink'  },
          ].map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all
                ${tab === key
                  ? key === 'best' ? 'bg-accent-lemon text-black border-accent-lemon' : 'bg-accent-pink text-white border-accent-pink'
                  : 'bg-fg/5 border-fg/10 text-fg/40 hover:bg-fg/10'
                }`}
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
            <div key={i} className="pwa-card h-[120px] animate-pulse bg-fg/[0.02]" />
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
        <div className="space-y-6">
          <p className="text-[9px] font-black uppercase tracking-widest text-fg/20">
            {display.length} posts — ordenados por {tab === 'best' ? 'mayor sentimiento positivo' : 'mayor sentimiento negativo'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {display.map((post, i) => (
              <a key={post.id || i} href={post.url} target="_blank" rel="noreferrer" className="block no-underline">
                <PostCard post={post} rank={i + 1} type={tab} />
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default PostsView;
