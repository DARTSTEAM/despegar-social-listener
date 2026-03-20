import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../config';
import { PlayCircle, Youtube, Clock, ExternalLink } from 'lucide-react';

const sentimentColor = (label) => {
  if (label === 'positive') return 'text-accent-lemon';
  if (label === 'negative') return 'text-accent-pink';
  return 'text-fg/40';
};

const sentimentDot = (label) => {
  if (label === 'positive') return 'bg-accent-lemon shadow-[0_0_6px_rgba(152,255,188,0.6)]';
  if (label === 'negative') return 'bg-accent-pink shadow-[0_0_6px_rgba(255,83,186,0.6)]';
  return 'bg-fg/30';
};

// ── Bell Curve component ──────────────────────────────────────────────────────
const BellCurve = ({ score = 0 }) => {
  const W = 400, H = 180;
  const pad = 20;
  const sigma = 0.32; // anchura de la campana

  // Gauss normal PDF
  const gauss = (x) => Math.exp(-0.5 * ((x / sigma) ** 2));

  // Generar puntos: x va de -1 a +1 (score range)
  const steps = 200;
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const xVal = -1 + (2 * i) / steps;            // -1..+1
    const px   = pad + ((xVal + 1) / 2) * (W - 2 * pad); // px en el SVG
    const py   = H - pad - gauss(xVal) * (H - 2 * pad - 20);
    return `${px},${py}`;
  });
  const pathD = `M ${points.join(' L ')}`;

  // Posición del marcador
  const clampedScore = Math.max(-1, Math.min(1, score));
  const markerX = pad + ((clampedScore + 1) / 2) * (W - 2 * pad);
  const markerY = H - pad - gauss(clampedScore) * (H - 2 * pad - 20);

  // Color según score
  const isPos = score > 0.1;
  const isNeg = score < -0.1;
  const accentColor = isPos ? '#98FFBC' : isNeg ? '#FF53BA' : '#ffffff55';
  const glowId = `glow-${Math.abs(score * 100).toFixed(0)}`;

  return (
    <div className="w-full flex flex-col items-center gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[420px]" style={{ overflow: 'visible' }}>
        <defs>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          {/* Gradiente bajo la curva */}
          <linearGradient id="bellGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.12" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0.01" />
          </linearGradient>
          <clipPath id="bellClip">
            <path d={`${pathD} L ${W - pad},${H - pad} L ${pad},${H - pad} Z`} />
          </clipPath>
        </defs>

        {/* Área rellena bajo la curva */}
        <path
          d={`${pathD} L ${W - pad},${H - pad} L ${pad},${H - pad} Z`}
          fill="url(#bellGrad)"
        />

        {/* Línea de la curva */}
        <path
          d={pathD}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Línea vertical del marcador */}
        <line
          x1={markerX} y1={markerY + 2}
          x2={markerX} y2={H - pad + 4}
          stroke={accentColor}
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.5"
        />

        {/* Punto de contacto en la curva */}
        <circle cx={markerX} cy={markerY} r="4" fill={accentColor} filter={`url(#${glowId})`} />

        {/* Ícono YouTube (círculo blanco + play rojo) */}
        <g transform={`translate(${markerX - 18}, ${markerY - 46})`}>
          {/* Círculo fondo blanco */}
          <circle cx="18" cy="18" r="20" fill="white" filter={`url(#${glowId})`} />
          {/* YouTube red background rect */}
          <rect x="5" y="11" width="26" height="14" rx="3" fill="#FF0000" />
          {/* Play triangle */}
          <polygon points="14,15 24,18 14,21" fill="white" />
        </g>

        {/* Baseline */}
        <line
          x1={pad} y1={H - pad + 4}
          x2={W - pad} y2={H - pad + 4}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
        />

        {/* Labels -1 / 0 / +1 */}
        {[[-1, 'Neg'], [0, '0'], [1, 'Pos']].map(([v, lbl]) => {
          const lx = pad + ((v + 1) / 2) * (W - 2 * pad);
          return (
            <text key={lbl} x={lx} y={H - 4} textAnchor="middle"
              fontSize="9" fill="rgba(255,255,255,0.2)" fontFamily="monospace" fontWeight="bold">
              {lbl}
            </text>
          );
        })}
      </svg>

      {/* Score label bajo la curva */}
      <p className="text-[10px] font-black uppercase tracking-widest text-fg/20 italic">
        posición en distribución normal · score {score > 0 ? '+' : ''}{score}
      </p>
    </div>
  );
};

const YouTubeSection = () => {
  const [videoUrl, setVideoUrl]     = useState('');
  const [videoData, setVideoData]   = useState({ recent: [], popular: [] });
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults]       = useState(null);
  const [error, setError]           = useState(null);

  const fetchLatest = async () => {
    setLoadingLatest(true);
    try {
      const res = await axios.get(`${API_BASE}/api/youtube/latest?channelId=UC_HTmhrhwj1j0qfYspRaM1A`);
      setVideoData(res.data || { recent: [], popular: [] });
    } catch (e) {
      console.warn('[YouTube] Error fetching latest videos', e.message);
    } finally {
      setLoadingLatest(false);
    }
  };

  useEffect(() => {
    fetchLatest();
  }, []);

  const handleAnalyze = async (urlToUse = null) => {
    const finalUrl = urlToUse || videoUrl;
    if (!finalUrl) return;

    setIsAnalyzing(true);
    setResults(null);
    setError(null);
    if (urlToUse) setVideoUrl(urlToUse);

    try {
      const res = await axios.post(`${API_BASE}/api/sentimining/analyze`, { url: finalUrl });
      setResults(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const VideoCard = ({ video, label }) => (
    <button 
      onClick={() => handleAnalyze(video.url)}
      disabled={isAnalyzing}
      className="group relative flex flex-col gap-2 text-left transition-all hover:translate-y-[-2px] focus:outline-none"
    >
      <div className="aspect-video rounded-xl overflow-hidden border border-white/5 group-hover:border-accent-pink/50 transition-all bg-white/5 relative shadow-lg">
        <img src={video.thumbnail} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" alt={video.title} />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 bg-black/40 backdrop-blur-[2px]">
          <PlayCircle className="w-8 h-8 text-white" />
        </div>
        {/* Link directo a YouTube */}
        <a 
          href={video.url} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-2 right-2 p-1.5 bg-black/60 rounded-full hover:bg-black transition-colors"
        >
          <ExternalLink className="w-3 h-3 text-white/50" />
        </a>
        {/* Label (Recent/Popular) */}
        <span className={`absolute top-2 right-2 ${label === 'RECIENTE' ? 'bg-accent-lemon' : 'bg-accent-pink'} text-black text-[8px] font-black px-1.5 py-0.5 rounded italic uppercase leading-none shadow-xl border border-black/10`}>
          {label}
        </span>
      </div>
      <p className="text-[10px] font-bold text-fg/40 line-clamp-2 leading-tight group-hover:text-fg transition-colors">
        {video.title}
      </p>
    </button>
  );

  return (
    <section className="space-y-8 pb-32">
      <header className="flex flex-col gap-4">
        <div>
          <p className="text-[10px] font-black text-accent-lemon uppercase tracking-[0.3em] mb-3 animate-pulse italic">Google Cloud Sentimining</p>
          <h1 className="pwa-title leading-tight text-fg">YouTube <br /><span className="text-accent-pink font-black tracking-tighter uppercase italic">Entity Intelligence</span></h1>
          <p className="text-xs text-fg/40 mt-4 max-w-xl font-medium leading-relaxed">
            Extrae automáticamente marcas, productos y conceptos de los comentarios y analiza el sentimiento específico hacia cada uno de ellos.
          </p>
        </div>
        
        <div className="flex gap-4 max-w-2xl mt-6">
          <input
            className="pwa-card bg-white/[0.03] border-white/10 px-6 py-5 text-sm flex-1 outline-none focus:border-accent-pink transition-all text-fg placeholder:text-fg/20 font-medium"
            placeholder="Pega la URL del video de YouTube..."
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && videoUrl && !isAnalyzing && handleAnalyze()}
          />
          <button
            onClick={() => handleAnalyze()}
            disabled={isAnalyzing || !videoUrl}
            className="pwa-btn px-10 bg-accent-pink border-accent-pink/50 text-black font-black hover:shadow-[0_0_40px_rgba(255,83,186,0.3)] disabled:opacity-50 uppercase italic tracking-tighter"
          >
            {isAnalyzing ? 'PROCESANDO...' : 'REPLICAR SENTIMINING'}
          </button>
        </div>

        {/* --- Latest Videos Quick Select --- */}
        <div className="pt-8 space-y-12">
          
          {/* RECIENTES */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-accent-lemon" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-lemon/60 italic">Últimos Lanzamientos (RECIENTES)</span>
              </div>
              <button onClick={fetchLatest} disabled={loadingLatest} className="p-1 hover:bg-white/5 rounded transition-all">
                <div className={`w-3 h-3 border-2 border-accent-pink border-t-transparent rounded-full ${loadingLatest ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {videoData.recent.map(v => <VideoCard key={v.id} video={v} label="RECIENTE" />)}
              {videoData.recent.length === 0 && !loadingLatest && (
                <p className="text-[10px] font-black uppercase italic text-fg/10 py-4">No hay videos recientes disponibles.</p>
              )}
            </div>
          </div>

          {/* POPULARES */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-white/5 pb-2">
              <Youtube className="w-3.5 h-3.5 text-accent-pink" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-pink/60 italic">Videos Tendencia (MÁS VISTOS)</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {videoData.popular.map(v => <VideoCard key={v.id} video={v} label="TREND" />)}
              {videoData.popular.length === 0 && !loadingLatest && (
                <p className="text-[10px] font-black uppercase italic text-fg/10 py-4">No hay videos populares disponibles.</p>
              )}
            </div>
          </div>

        </div>

        {isAnalyzing && (
          <div className="flex items-center gap-3 mt-4">
            <div className="w-2 h-2 bg-accent-pink rounded-full animate-ping" />
            <p className="text-[10px] font-black uppercase italic tracking-widest text-accent-pink">
              Google Natural Language API está analizando entidades... (~30s)
            </p>
          </div>
        )}
      </header>

      {error && (
        <div className="pwa-card p-6 border-accent-pink/30 bg-accent-pink/5 text-accent-pink text-xs font-black italic uppercase tracking-widest flex items-center gap-4">
           <span className="text-2xl">⚠️</span> {error}
        </div>
      )}

      {results && (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-1000">
          
          {/* ── Overall Sentiment Hero ── */}
          <div className="pwa-card bg-gradient-to-br from-white/[0.03] to-white/[0.01] border-white/5 p-10 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-96 h-96 bg-accent-pink/5 blur-[120px] rounded-full -mr-48 -mt-48" />

            <div className="flex flex-col md:flex-row items-center gap-10 relative z-10">
              {/* Texto izquierdo */}
              <div className="space-y-3 md:w-56 shrink-0">
                <p className="text-[10px] font-black uppercase tracking-[0.5em] text-fg/40">Overall Video Sentiment</p>
                <h2 className="text-4xl font-black italic tracking-tighter text-fg uppercase">Video Pulse</h2>
                <p className="text-xs text-fg/40 leading-relaxed italic">
                  Puntaje calculado sobre {results.total_comments} comentarios combinando sentimiento semántico y emocional.
                </p>
              </div>

              {/* Bell Curve — centro */}
              <div className="flex-1 min-w-0">
                <BellCurve score={results.overall_sentiment} />
              </div>

              {/* Score derecho */}
              <div className="text-center md:text-right shrink-0 md:w-48">
                <p className={`text-7xl font-black italic tracking-tighter ${
                  results.overall_sentiment > 0.1 ? 'text-accent-lemon' :
                  results.overall_sentiment < -0.1 ? 'text-accent-pink' : 'text-fg/40'
                }`}>
                  {results.overall_sentiment > 0 ? '+' : ''}{results.overall_sentiment}
                </p>
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mt-4 max-w-[160px] mx-auto md:ml-auto md:mr-0">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${
                      results.overall_sentiment > 0.1 ? 'bg-accent-lemon' :
                      results.overall_sentiment < -0.1 ? 'bg-accent-pink' : 'bg-fg/40'
                    }`}
                    style={{ width: `${Math.abs(results.overall_sentiment) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] mt-3 text-fg/20 italic">
                  {results.overall_sentiment > 0.4 ? 'Extremely Positive' :
                   results.overall_sentiment > 0.1 ? 'Positive Mood' :
                   results.overall_sentiment < -0.4 ? 'Hostile Environment' :
                   results.overall_sentiment < -0.1 ? 'Negative Feedback' : 'Mixed / Neutral'}
                </p>
              </div>
            </div>
          </div>


          {/* ── Summary Stats ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Analizados', value: results.total_comments, color: 'text-fg' },
              { label: 'Entidades', value: results.entities?.length || 0, color: 'text-accent-pink' },
              { label: 'Video ID',   value: results.videoId, color: 'text-fg/20' },
              { label: 'Status',    value: 'SUCCESS', color: 'text-accent-lemon' }
            ].map(({ label, value, color }) => (
              <div key={label} className="pwa-card p-6 bg-white/[0.02] border-white/5 group hover:bg-white/[0.04] transition-all">
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-fg/20 group-hover:text-fg/40 transition-colors">{label}</p>
                <p className={`text-xl font-black italic mt-2 truncate ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* ── Entidades Rankeadas ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            
            {/* 🔴 Top 10 Negativas (RIESGOS) */}
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-accent-pink/50">
                  Risk Areas (Top 10 Negative)
                </h2>
                <span className="text-[11px] font-black text-white/20 italic">Sentiment &lt; 0</span>
              </div>
              
              <div className="space-y-4">
                {results.entities
                  ?.filter(e => e.sentiment_avg < -0.05 && e.top_mentions?.length > 0)
                  .sort((a, b) => a.sentiment_avg - b.sentiment_avg)
                  .slice(0, 10)
                  .map((item, idx) => (
                    <div key={idx} className="pwa-card bg-accent-pink/[0.02] border-white/5 p-6 hover:bg-accent-pink/[0.04] transition-all group">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-widest text-accent-pink/40 mb-1">Entity</p>
                          <h3 className="text-lg font-black italic text-fg capitalize tracking-tighter group-hover:text-accent-pink transition-colors">{item.entity}</h3>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] font-black uppercase tracking-widest text-fg/20 mb-1">Sentiment</p>
                          <p className="text-2xl font-black italic text-accent-pink">{item.sentiment_avg}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                         {item.top_mentions?.slice(0, 2).map((m, ridx) => (
                            <div key={ridx} className="bg-black/20 p-3 rounded-lg border border-white/5">
                               <p className="text-[10px] text-fg/50 italic leading-snug line-clamp-2">"{m.text}"</p>
                            </div>
                         ))}
                      </div>
                      <div className="mt-4 flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-accent-pink/10 border border-accent-pink/20 text-[10px] font-black text-accent-pink rounded uppercase">
                          {item.mentions} menciones detectadas
                        </span>
                      </div>
                    </div>
                  ))
                }
                {(!results.entities || results.entities.filter(e => e.sentiment_avg < -0.05 && e.top_mentions?.length > 0).length === 0) && (
                   <p className="text-[10px] font-black uppercase italic tracking-[0.2em] text-fg/10 text-center py-10">No significant negative entities found</p>
                )}
              </div>
            </div>

            {/* 🟢 Top 10 Positivas (GANADORAS) */}
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-accent-lemon/50">
                  Winning Points (Top 10 Positive)
                </h2>
                <span className="text-[11px] font-black text-white/20 italic">Sentiment &gt; 0</span>
              </div>
              
              <div className="space-y-4">
                {results.entities
                  ?.filter(e => e.sentiment_avg > 0.05 && e.top_mentions?.length > 0)
                  .sort((a, b) => b.sentiment_avg - a.sentiment_avg)
                  .slice(0, 10)
                  .map((item, idx) => (
                    <div key={idx} className="pwa-card bg-accent-lemon/[0.02] border-white/5 p-6 hover:bg-accent-lemon/[0.04] transition-all group">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-widest text-accent-lemon/40 mb-1">Entity</p>
                          <h3 className="text-lg font-black italic text-fg capitalize tracking-tighter group-hover:text-accent-lemon transition-colors">{item.entity}</h3>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] font-black uppercase tracking-widest text-fg/20 mb-1">Sentiment</p>
                          <p className="text-2xl font-black italic text-accent-lemon">+{item.sentiment_avg}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                         {item.top_mentions?.slice(0, 2).map((m, ridx) => (
                            <div key={ridx} className="bg-black/20 p-3 rounded-lg border border-white/5">
                               <p className="text-[10px] text-fg/50 italic leading-snug line-clamp-2">"{m.text}"</p>
                            </div>
                         ))}
                      </div>
                      <div className="mt-4 flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-accent-lemon/10 border border-accent-lemon/20 text-[10px] font-black text-accent-lemon rounded uppercase">
                          {item.mentions} menciones detectadas
                        </span>
                      </div>
                    </div>
                  ))
                }
                {(!results.entities || results.entities.filter(e => e.sentiment_avg > 0.05 && e.top_mentions?.length > 0).length === 0) && (
                   <p className="text-[10px] font-black uppercase italic tracking-[0.2em] text-fg/10 text-center py-10">No significant positive entities found</p>
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </section>
  );
};

export default YouTubeSection;
