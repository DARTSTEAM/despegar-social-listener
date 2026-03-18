import { useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../config';

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

const YouTubeSection = () => {
  const [videoUrl, setVideoUrl]     = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults]       = useState(null);
  const [error, setError]           = useState(null);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setResults(null);
    setError(null);
    try {
      const res = await axios.post(`${API_BASE}/api/youtube/analyze`, { videoUrl });
      setResults(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const sentiment = results?.sentiment || {};
  const comments  = Array.isArray(results?.comments) ? results.comments : [];
  const topics    = Array.isArray(results?.topTopics) ? results.topTopics : [];

  return (
    <section className="space-y-8 pb-20">
      <header className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-bold text-fg/20 uppercase tracking-widest mb-2">Gemini AI Analysis</p>
          <h1 className="pwa-title leading-tight text-fg">YouTube <br /><span className="text-accent-lemon font-black tracking-tighter uppercase italic">Comment Analysis</span></h1>
        </div>
        <div className="flex gap-4 max-w-2xl mt-4">
          <input
            className="pwa-card bg-fg/5 border-fg/10 px-6 py-4 text-xs flex-1 outline-none focus:border-accent-lemon transition-all text-fg"
            placeholder="https://www.youtube.com/watch?v=..."
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && videoUrl && !isAnalyzing && handleAnalyze()}
          />
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !videoUrl}
            className="pwa-btn px-8 bg-accent-lemon border-accent-lemon/50 text-black font-black hover:shadow-[0_0_30px_rgba(152,255,188,0.4)] disabled:opacity-50"
          >
            {isAnalyzing ? 'PROCESANDO...' : 'ANALIZAR'}
          </button>
        </div>
        {isAnalyzing && (
          <p className="text-[9px] font-black uppercase italic tracking-widest text-fg/30 animate-pulse">
            Extrayendo comentarios con Apify → Analizando con Gemini (~60s)...
          </p>
        )}
      </header>

      {error && (
        <div className="pwa-card p-4 border-accent-pink/50 bg-accent-pink/10 text-accent-pink text-[10px] font-black italic uppercase tracking-widest">
          ERROR DETECTADO: {error}
        </div>
      )}

      {results && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

          {/* ── Stats de sentimiento ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Comentarios',  value: results.commentsCount || comments.length, color: 'text-fg' },
              { label: 'Positivos',    value: `${sentiment.positive || 0}%`,  color: 'text-accent-lemon', bar: sentiment.positive, barColor: 'bg-accent-lemon' },
              { label: 'Negativos',    value: `${sentiment.negative || 0}%`,  color: 'text-accent-pink',  bar: sentiment.negative, barColor: 'bg-accent-pink'  },
              { label: 'Neutrales',    value: `${sentiment.neutral  || 0}%`,  color: 'text-fg/40',        bar: sentiment.neutral,  barColor: 'bg-fg/20'        },
            ].map(({ label, value, color, bar, barColor }) => (
              <div key={label} className="pwa-card p-5 bg-fg/[0.02] border-fg/5 space-y-3">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-fg/30">{label}</p>
                <p className={`text-2xl font-black italic ${color}`}>{value}</p>
                {bar !== undefined && (
                  <div className="h-1 w-full bg-fg/5 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} rounded-full`} style={{ width: `${bar}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── Resumen + Topics ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 pwa-card p-8 bg-fg/[0.02] border-fg/5 space-y-4">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-fg/30">Resumen Ejecutivo</p>
              <p className="text-sm text-fg/70 italic leading-relaxed">{results.summary || '—'}</p>
            </div>
            {topics.length > 0 && (
              <div className="pwa-card p-6 bg-fg/[0.02] border-fg/5 space-y-4">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-fg/30">Temas Principales</p>
                <div className="flex flex-wrap gap-2">
                  {topics.map((t, i) => (
                    <span key={i} className="px-2.5 py-1 bg-accent-lemon/10 border border-accent-lemon/20 text-accent-lemon text-[8px] font-black uppercase rounded-full">{t}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Comentarios ── */}
          {comments.length > 0 && (
            <div className="pwa-card overflow-hidden border-fg/5 bg-fg/[0.02]">
              <div className="px-8 py-5 border-b border-fg/5">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-fg/30">Comentarios analizados ({comments.length})</p>
              </div>
              <div className="divide-y divide-fg/[0.03] max-h-[500px] overflow-y-auto no-scrollbar">
                {comments.map((c, i) => {
                  const pos = sentiment.positive || 0;
                  const neg = sentiment.negative || 0;
                  const neu = sentiment.neutral  || 0;
                  const label = pos >= neg && pos >= neu ? 'positive' : neg >= pos && neg >= neu ? 'negative' : 'neutral';
                  return (
                    <div key={i} className="flex gap-4 px-8 py-4 hover:bg-fg/[0.02] transition-colors">
                      <div className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${sentimentDot(label)}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-accent-lemon/80 mb-1">@{c.author || 'Usuario'}</p>
                        <p className="text-xs text-fg/60 italic leading-snug line-clamp-2">"{c.text}"</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <span className="text-[8px] font-black uppercase text-fg/20">{c.likes || 0} 👍</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default YouTubeSection;
