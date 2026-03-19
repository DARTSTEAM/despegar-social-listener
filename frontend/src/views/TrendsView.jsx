import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  TrendingUp, Eye, Heart, MessageCircle, Hash, Flame,
  RefreshCw, ExternalLink, Play, Music, Globe, Filter, Zap, CheckCircle, AlertCircle
} from 'lucide-react';
import { API_BASE } from '../config';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => {
  if (!n && n !== 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const platformStyle = {
  tiktok:    { border: 'border-[#69C9D0]/30', bg: 'bg-[#69C9D0]/5', badge: 'border-[#69C9D0]/40 text-[#69C9D0]', dot: '#69C9D0' },
  instagram: { border: 'border-[#E1306C]/30', bg: 'bg-[#E1306C]/5', badge: 'border-[#E1306C]/40 text-[#E1306C]', dot: '#E1306C' },
};

// ── Mock data — reemplazar con datos de Apify cuando esté configurado ────────
const MOCK_TRENDS = [
  {
    id: 'tt-1', platform: 'tiktok', type: 'hashtag',
    title: '#viajando2025', subtitle: 'Trending en Argentina · Viajes',
    views: 48200000, likes: 3100000, comments: 87400, shares: 420000,
    posts_count: 12400, growth_pct: 34,
    description: 'Contenido de viajeros compartiendo experiencias de vuelos y hoteles en 2025.',
    top_accounts: ['@mochilerodigital', '@travelargentina', '@despegar'],
    keywords: ['vuelo', 'hotel', 'verano', 'mochila', 'aventura'],
    thumbnail: null, source: 'mock',
  },
  {
    id: 'tt-2', platform: 'tiktok', type: 'audio',
    title: 'Pack Your Bags', subtitle: 'Audio viral · Travel',
    views: 31500000, likes: 2400000, comments: 54200, shares: 310000,
    posts_count: 8900, growth_pct: 58,
    description: 'Audio usado en videos de "travel aesthetic" y preparativos de viaje.',
    top_accounts: ['@wanderlust.arg', '@flightmode', '@viajesok'],
    keywords: ['travel aesthetic', 'packing', 'bucket list', 'getaway'],
    thumbnail: null, source: 'mock',
  },
  {
    id: 'tt-3', platform: 'tiktok', type: 'hashtag',
    title: '#ofertas vuelos', subtitle: 'En ascenso · Aerolíneas',
    views: 22800000, likes: 1750000, comments: 41300, shares: 198000,
    posts_count: 6700, growth_pct: 21,
    description: 'Usuarios compartiendo deals y promociones de aerolíneas y agencias.',
    top_accounts: ['@aerolineas_deals', '@pricehunter.ar', '@viajesofertas'],
    keywords: ['oferta', 'deal', 'barato', 'promo', 'vuelo'],
    thumbnail: null, source: 'mock',
  },
  {
    id: 'ig-1', platform: 'instagram', type: 'hashtag',
    title: '#viajesargentina', subtitle: 'Trending en Instagram · Lifestyle',
    views: 65100000, likes: 4900000, comments: 112000, shares: 580000,
    posts_count: 31200, growth_pct: 12,
    description: 'El hashtag más usado para contenido de viaje dentro del país.',
    top_accounts: ['@argentina.travel', '@visitargentina', '@patagonia_trips'],
    keywords: ['argentina', 'patagonia', 'mendoza', 'bariloche', 'salta'],
    thumbnail: null, source: 'mock',
  },
  {
    id: 'ig-2', platform: 'instagram', type: 'hashtag',
    title: '#vacaciones2025', subtitle: 'Estacional · Alta temporada',
    views: 41700000, likes: 3200000, comments: 74000, shares: 390000,
    posts_count: 18900, growth_pct: 44,
    description: 'Reservas y planificación de vacaciones de verano austral.',
    top_accounts: ['@sol_y_playa', '@reservas_online', '@turismofamiliar'],
    keywords: ['verano', 'playa', 'reserva', 'familia', 'descanso'],
    thumbnail: null, source: 'mock',
  },
  {
    id: 'ig-3', platform: 'instagram', type: 'challenge',
    title: 'Travel Bucket List', subtitle: 'Reel challenge · Global',
    views: 28900000, likes: 2100000, comments: 49800, shares: 267000,
    posts_count: 9400, growth_pct: 67,
    description: 'Challenge donde usuarios muestran su lista de destinos pendientes.',
    top_accounts: ['@bucketlist.global', '@travelgoals', '@wanderlust_ar'],
    keywords: ['bucket list', 'destinos', 'sueños', 'wanderlust', 'metas'],
    thumbnail: null, source: 'mock',
  },
  {
    id: 'tt-4', platform: 'tiktok', type: 'hashtag',
    title: '#despegar', subtitle: 'Marca · Agencia de viajes',
    views: 18400000, likes: 1320000, comments: 38900, shares: 172000,
    posts_count: 5200, growth_pct: 8,
    description: 'Menciones orgánicas de la marca en contenido de viajes y reservas.',
    top_accounts: ['@despegar', '@despegar_ar', '@viajescondespegar'],
    keywords: ['reserva', 'vuelo', 'hotel', 'agencia', 'app'],
    thumbnail: null, source: 'mock',
  },
  {
    id: 'ig-4', platform: 'instagram', type: 'audio',
    title: 'Summer Memories', subtitle: 'Audio · Reels lifestyle',
    views: 19200000, likes: 1480000, comments: 33000, shares: 145000,
    posts_count: 7100, growth_pct: 29,
    description: 'Audio nostálgico muy usado en reels de viaje con fotos de playa y sol.',
    top_accounts: ['@sunsets_arg', '@beach_vibes_ar', '@verano365'],
    keywords: ['playa', 'sol', 'agua', 'verano', 'viaje'],
    thumbnail: null, source: 'mock',
  },
];

const TYPE_ICON = { hashtag: Hash, audio: Music, challenge: Flame };
const TYPE_LABEL = { hashtag: 'Hashtag', audio: 'Audio viral', challenge: 'Challenge' };

// ── Config de keywords — lista editable ──────────────────────────────────────
const DEFAULT_KEYWORDS = ['travel', 'viajes', 'despegar', 'vuelos', 'hotel', 'vacaciones', 'turismo'];

// ── TrendCard ─────────────────────────────────────────────────────────────────
const TrendCard = ({ trend, rank, onClick, selected }) => {
  const ps  = platformStyle[trend.platform] || platformStyle.tiktok;
  const Ico = TYPE_ICON[trend.type] || Hash;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: rank * 0.04 }}
      onClick={() => onClick(trend)}
      className={`pwa-card cursor-pointer transition-all duration-200 border
        ${selected ? `${ps.border} ${ps.bg} scale-[1.01]` : 'border-fg/8 hover:border-fg/20 hover:bg-fg/[0.02]'}
      `}
    >
      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Rank */}
            <span className="text-[9px] font-black tabular-nums text-fg/15 w-5 shrink-0">
              {String(rank).padStart(2, '0')}
            </span>
            {/* Platform dot */}
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ps.dot }} />
            {/* Title */}
            <div className="min-w-0">
              <p className="text-sm font-black italic truncate text-fg leading-none">{trend.title}</p>
              <p className="text-[8px] text-fg/30 mt-0.5 uppercase tracking-widest">{trend.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Type badge */}
            <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase border ${ps.badge}`}>
              <Ico size={8} className="inline mr-0.5" />{TYPE_LABEL[trend.type] || trend.type}
            </span>
            {/* Growth */}
            <span className="px-1.5 py-0.5 rounded text-[7px] font-black uppercase border border-accent-lemon/30 text-accent-lemon bg-accent-lemon/5">
              +{trend.growth_pct}% ↑
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4">
          {[
            { icon: Eye,            val: fmt(trend.views),    label: 'Views'     },
            { icon: Heart,          val: fmt(trend.likes),    label: 'Likes'     },
            { icon: MessageCircle,  val: fmt(trend.comments), label: 'Coments'   },
            { icon: Play,           val: fmt(trend.posts_count), label: 'Posts'  },
          ].map(({ icon: Icon, val, label }) => (
            <div key={label} className="flex items-center gap-1">
              <Icon size={9} className="text-fg/25" />
              <span className="text-[9px] font-black text-fg/50">{val}</span>
            </div>
          ))}
          {trend.source === 'mock' && (
            <span className="ml-auto text-[7px] text-fg/15 italic">demo data</span>
          )}
        </div>

        {/* Keywords */}
        <div className="flex flex-wrap gap-1">
          {trend.keywords?.slice(0, 4).map(kw => (
            <span key={kw} className="px-1.5 py-0 rounded-full bg-fg/[0.04] border border-fg/8 text-[7px] text-fg/40 uppercase tracking-wide">
              {kw}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

// ── TrendDetail ───────────────────────────────────────────────────────────────
const TrendDetail = ({ trend, onClose }) => {
  const ps  = platformStyle[trend.platform] || platformStyle.tiktok;
  const Ico = TYPE_ICON[trend.type] || Hash;

  return (
    <motion.div
      key={trend.id}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`pwa-card border sticky top-4 space-y-5 overflow-y-auto max-h-[calc(100vh-6rem)] ${ps.border} ${ps.bg}`}
    >
      <div className="p-5 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase border ${ps.badge}`}>
                {trend.platform}
              </span>
              <span className="text-[7px] text-fg/20 uppercase font-bold">
                <Ico size={8} className="inline mr-0.5" />{TYPE_LABEL[trend.type]}
              </span>
            </div>
            <h2 className="text-xl font-black italic text-fg leading-tight">{trend.title}</h2>
            <p className="text-[9px] text-fg/30 uppercase tracking-widest">{trend.subtitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-fg/5 hover:bg-fg/10 transition-all shrink-0">
            <span className="text-fg/40 text-xs font-black">✕</span>
          </button>
        </div>

        {/* Growth badge */}
        <div className="flex items-center gap-2">
          <TrendingUp size={12} className="text-accent-lemon" />
          <span className="text-[10px] font-black text-accent-lemon">
            Crecimiento: +{trend.growth_pct}% en las últimas 24hs
          </span>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: Eye,           val: fmt(trend.views),       label: 'Views totales' },
            { icon: Heart,         val: fmt(trend.likes),       label: 'Likes'         },
            { icon: MessageCircle, val: fmt(trend.comments),    label: 'Comentarios'   },
            { icon: Play,          val: fmt(trend.posts_count), label: 'Posts con tag' },
          ].map(({ icon: Icon, val, label }) => (
            <div key={label} className="p-3 bg-fg/[0.03] rounded-xl border border-fg/5 space-y-1">
              <div className="flex items-center gap-1.5">
                <Icon size={10} className="text-fg/25" />
                <span className="text-[8px] font-black uppercase tracking-widest text-fg/25">{label}</span>
              </div>
              <p className="text-lg font-black italic text-fg">{val}</p>
            </div>
          ))}
        </div>

        {/* Descripción */}
        <div className="space-y-1.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-fg/30">¿De qué se trata?</p>
          <p className="text-[11px] text-fg/60 leading-relaxed">{trend.description}</p>
        </div>

        {/* Keywords */}
        <div className="space-y-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-fg/30">Keywords asociadas</p>
          <div className="flex flex-wrap gap-1.5">
            {trend.keywords?.map(kw => (
              <span key={kw} className={`px-2 py-0.5 rounded-full border text-[8px] font-black uppercase ${ps.badge}`}>
                {kw}
              </span>
            ))}
          </div>
        </div>

        {/* Top accounts */}
        <div className="space-y-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-fg/30">Top cuentas usando este trend</p>
          <div className="space-y-1.5">
            {trend.top_accounts?.map((acc, i) => (
              <div key={acc} className="flex items-center gap-2 p-2 bg-fg/[0.03] rounded-xl border border-fg/5">
                <span className="text-[8px] font-black text-fg/20 w-4">{i + 1}</span>
                <span className="text-[10px] font-black text-fg/70">{acc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Nota de fuente */}
        {trend.source === 'mock' && (
          <div className="p-3 bg-accent-lemon/5 border border-accent-lemon/15 rounded-xl">
            <p className="text-[8px] text-accent-lemon/70 italic leading-snug">
              ⚡ Datos de demostración. Conectá Apify en Ajustes → Trends para ver datos reales en tiempo real de TikTok e Instagram.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// ── TrendsView ────────────────────────────────────────────────────────────────
const TrendsView = () => {
  const [trends, setTrends]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [platform, setPlatform]     = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selected, setSelected]     = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isLive, setIsLive]         = useState(false);
  const [scanning, setScanning]     = useState(false);
  const [scanPlatform, setScanPlatform] = useState('tiktok');
  const [scanResult, setScanResult] = useState(null); // { ok, trends_saved, error }

  const runTrendsScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const { data } = await axios.post(`${API_BASE}/api/trends/run`, {
        platform: scanPlatform,
        maxItems: 25, // liviano — ajustar según cuota
      }, { timeout: 150000 });
      setScanResult({ ok: true, saved: data.trends_saved, fetched: data.items_fetched });
      // Refrescar lista después del scan
      await fetchTrends();
    } catch (err) {
      setScanResult({ ok: false, error: err.response?.data?.error || err.message });
    } finally {
      setScanning(false);
    }
  };

  const fetchTrends = async () => {
    setLoading(true);
    try {
      const params = {};
      if (platform !== 'all') params.platform = platform;
      if (typeFilter !== 'all') params.type = typeFilter;
      const { data } = await axios.get(`${API_BASE}/api/trends`, { params, timeout: 10000 });
      if (Array.isArray(data) && data.length > 0) {
        setTrends(data);
        setIsLive(data.some(t => t.source !== 'mock'));
      } else {
        setTrends(MOCK_TRENDS);
        setIsLive(false);
      }
      setLastUpdated(new Date());
    } catch {
      // Backend no disponible — usar mock local
      setTrends(MOCK_TRENDS);
      setIsLive(false);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrends();
  }, [platform, typeFilter]);

  // Filtrar en cliente
  const display = trends.filter(t => {
    if (platform !== 'all' && t.platform !== platform) return false;
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    return true;
  });

  // Ordenar por views
  display.sort((a, b) => (b.views || 0) - (a.views || 0));

  const handleSelect = (trend) => {
    setSelected(prev => prev?.id === trend.id ? null : trend);
  };

  return (
    <section className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-[#9B72F5]" />
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-fg/30 italic">
              Trends Monitor
            </span>
            {isLive ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-lemon/10 border border-accent-lemon/30">
                <span className="w-1.5 h-1.5 bg-accent-lemon rounded-full animate-pulse" />
                <span className="text-[7px] font-black uppercase text-accent-lemon">Live</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-fg/5 border border-fg/10 text-[7px] font-black uppercase text-fg/25">
                Demo
              </span>
            )}
          </div>
          <h1 className="text-3xl font-black italic text-fg">Tendencias</h1>
          <p className="text-[10px] text-fg/30 mt-1">
            TikTok & Instagram · Keywords: travel, viajes, despegar, vuelos, hotel
          </p>
          {lastUpdated && (
            <p className="text-[8px] text-fg/20 mt-0.5 italic">
              Actualizado {lastUpdated.toLocaleTimeString('es-AR', { hour: '2-digit', minute:'2-digit' })}
            </p>
          )}
        </div>

        {/* Acciones */}
        <div className="flex flex-col items-end gap-2">
          {/* Scan button */}
          <div className="flex items-center gap-2">
            {/* Selector plataforma del scan */}
            <div className="flex items-center gap-1 p-1 bg-fg/[0.03] border border-fg/8 rounded-xl">
              {['tiktok','instagram'].map(p => (
                <button key={p}
                  onClick={() => setScanPlatform(p)}
                  disabled={scanning}
                  className={`px-2.5 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                    scanPlatform === p ? 'bg-fg/10 text-fg' : 'text-fg/30 hover:text-fg/60'
                  }`}>{p}
                </button>
              ))}
            </div>

            <button
              onClick={runTrendsScan}
              disabled={scanning}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all text-[9px] font-black uppercase tracking-widest ${
                scanning
                  ? 'bg-[#9B72F5]/10 border-[#9B72F5]/30 text-[#9B72F5]/60 cursor-not-allowed'
                  : 'bg-[#9B72F5]/10 border-[#9B72F5]/30 hover:bg-[#9B72F5]/20 text-[#9B72F5]'
              }`}
            >
              <Zap size={11} className={scanning ? 'animate-pulse' : ''} />
              {scanning ? `Escaneando ${scanPlatform}…` : `Escanear ${scanPlatform}`}
            </button>

            <button
              onClick={fetchTrends}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-fg/[0.03] border border-fg/10 hover:bg-fg/[0.06] transition-all text-[9px] font-black uppercase tracking-widest text-fg/40 hover:text-fg"
            >
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Resultado del último scan */}
          <AnimatePresence>
            {scanResult && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[8px] font-black ${
                  scanResult.ok
                    ? 'bg-accent-lemon/5 border-accent-lemon/20 text-accent-lemon'
                    : 'bg-accent-pink/5 border-accent-pink/20 text-accent-pink'
                }`}
              >
                {scanResult.ok
                  ? <><CheckCircle size={10} /> {scanResult.saved} trends guardados ({scanResult.fetched} posts analizados)</>
                  : <><AlertCircle size={10} /> {scanResult.error}</>
                }
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Platform */}
        <div className="flex items-center gap-1 p-1 bg-fg/[0.03] border border-fg/8 rounded-xl">
          {[
            { val: 'all',       label: 'Todas',    dot: null },
            { val: 'tiktok',    label: 'TikTok',   dot: '#69C9D0' },
            { val: 'instagram', label: 'Instagram', dot: '#E1306C' },
          ].map(opt => (
            <button
              key={opt.val}
              onClick={() => { setPlatform(opt.val); setSelected(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                platform === opt.val
                  ? 'bg-fg/10 text-fg shadow-inner'
                  : 'text-fg/30 hover:text-fg/60'
              }`}
            >
              {opt.dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: opt.dot }} />}
              {opt.label}
            </button>
          ))}
        </div>

        {/* Type */}
        <div className="flex items-center gap-1 p-1 bg-fg/[0.03] border border-fg/8 rounded-xl">
          {[
            { val: 'all',       label: 'Todos'    },
            { val: 'hashtag',   label: 'Hashtags' },
            { val: 'audio',     label: 'Audios'   },
            { val: 'challenge', label: 'Challenges' },
          ].map(opt => (
            <button
              key={opt.val}
              onClick={() => { setTypeFilter(opt.val); setSelected(null); }}
              className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                typeFilter === opt.val
                  ? 'bg-fg/10 text-fg shadow-inner'
                  : 'text-fg/30 hover:text-fg/60'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary scorecards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Trends activos',  val: display.length,                            icon: Flame },
          { label: 'Views totales',   val: fmt(display.reduce((a,t)=>a+(t.views||0),0)),  icon: Eye   },
          { label: 'Posts asociados', val: fmt(display.reduce((a,t)=>a+(t.posts_count||0),0)), icon: Play },
          { label: 'Mayor crecimiento', val: display.length ? `+${Math.max(...display.map(t=>t.growth_pct))}%` : '—', icon: TrendingUp },
        ].map(({ label, val, icon: Icon }) => (
          <div key={label} className="pwa-card p-4 border border-fg/5 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Icon size={10} className="text-[#9B72F5]" />
              <span className="text-[8px] font-black uppercase tracking-widest text-fg/25">{label}</span>
            </div>
            <p className="text-2xl font-black italic text-fg">{val}</p>
          </div>
        ))}
      </div>

      {/* Lista + panel */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-24 rounded-2xl bg-fg/[0.03] animate-pulse border border-fg/5" />
          ))}
        </div>
      ) : display.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <Globe size={32} className="text-fg/10" />
          <p className="text-[10px] font-black uppercase tracking-widest text-fg/20">Sin trends para este filtro</p>
        </div>
      ) : (
        <div className={`flex gap-6 items-start`}>
          {/* Lista */}
          <div className={`space-y-2 transition-all duration-300 ${selected ? 'flex-[2]' : 'flex-1'}`}>
            <p className="text-[9px] font-black uppercase tracking-widest text-fg/20 mb-4">
              {display.length} trends · Click para ver detalle
            </p>
            {display.map((trend, i) => (
              <TrendCard
                key={trend.id}
                trend={trend}
                rank={i + 1}
                selected={selected?.id === trend.id}
                onClick={handleSelect}
              />
            ))}
          </div>

          {/* Panel detalle */}
          <AnimatePresence mode="wait">
            {selected && (
              <div key={selected.id} className="flex-[1.2] min-w-[280px] max-w-[400px]">
                <TrendDetail trend={selected} onClose={() => setSelected(null)} />
              </div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Nota configuración Apify */}
      {!isLive && (
        <div className="pwa-card border border-[#9B72F5]/15 bg-[#9B72F5]/[0.03] p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Filter size={12} className="text-[#9B72F5]/60" />
            <span className="text-[9px] font-black uppercase tracking-widest text-[#9B72F5]/60">
              Configuración pendiente
            </span>
          </div>
          <p className="text-[10px] text-fg/50 leading-relaxed">
            Para ver trends reales de TikTok e Instagram, conectá <strong className="text-fg/70">Apify</strong> con los actores
            <code className="text-[#9B72F5]/80 mx-1">apify/tiktok-hashtag-scraper</code> y
            <code className="text-[#9B72F5]/80 mx-1">apify/instagram-hashtag-scraper</code>.
            Una vez configurado, el endpoint <code className="text-[#9B72F5]/80">/api/trends</code> recibirá los datos
            automáticamente y esta pantalla se actualizará en tiempo real.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {DEFAULT_KEYWORDS.map(kw => (
              <span key={kw} className="px-2 py-0.5 rounded-full border border-[#9B72F5]/20 text-[8px] font-black text-[#9B72F5]/50 uppercase">
                #{kw}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default TrendsView;
