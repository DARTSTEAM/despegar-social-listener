import { useState, useEffect } from 'react';
import axios from 'axios';
import { Settings, BarChart3, Search, CheckSquare, Square } from 'lucide-react';
import { API_BASE } from '../config';

// ─── Lista maestra de todas las cuentas posibles ────────────────────────────
// IMPORTANTE: las keys deben coincidir con brand:platform en el backend
const ALL_TARGETS = [
  // ── Owned ────────────────────────────────────────────────────────────────
  { key: 'Despegar:instagram',    brand: 'Despegar',      platform: 'Instagram', handle: '@despegar',         type: 'Owned',      url: 'https://www.instagram.com/despegar/' },
  { key: 'Despegar AR:instagram', brand: 'Despegar AR',   platform: 'Instagram', handle: '@despegar.ar',      type: 'Owned',      url: 'https://www.instagram.com/despegar.ar/' },
  { key: 'Despegar:tiktok',       brand: 'Despegar',      platform: 'TikTok',    handle: '@despegar',         type: 'Owned',      url: 'https://www.tiktok.com/@despegar' },
  // ── Competitors ──────────────────────────────────────────────────────────
  { key: 'Turismo City:instagram',brand: 'Turismo City',  platform: 'Instagram', handle: '@turismocity_ar',   type: 'Competitor', url: 'https://www.instagram.com/turismocity_ar/' },
  { key: 'Booking:instagram',     brand: 'Booking',       platform: 'Instagram', handle: '@bookingcom',       type: 'Competitor', url: 'https://www.instagram.com/bookingcom/' },
  { key: 'Airbnb:instagram',      brand: 'Airbnb',        platform: 'Instagram', handle: '@airbnb',           type: 'Competitor', url: 'https://www.instagram.com/airbnb/' },
  { key: 'Turismo City:tiktok',   brand: 'Turismo City',  platform: 'TikTok',    handle: '@turismocity',      type: 'Competitor', url: 'https://www.tiktok.com/@turismocity' },
  { key: 'Booking:tiktok',        brand: 'Booking',       platform: 'TikTok',    handle: '@bookingcom',       type: 'Competitor', url: 'https://www.tiktok.com/@bookingcom' },
  { key: 'Airbnb:tiktok',         brand: 'Airbnb',        platform: 'TikTok',    handle: '@airbnb',           type: 'Competitor', url: 'https://www.tiktok.com/@airbnb' },
];

const SettingsView = ({ brandsStatus, showConfirm, showAlert, onMassScanStart }) => {
  const [enabled, setEnabled] = useState(
    () => Object.fromEntries(ALL_TARGETS.map(t => [t.key, true]))
  );
  const [apifyUsage, setApifyUsage] = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE}/api/admin/apify-usage`)
      .then(r => setApifyUsage(r.data))
      .catch(() => setApifyUsage(null));
  }, []);


  const toggle = (key) => setEnabled(prev => ({ ...prev, [key]: !prev[key] }));
  const enabledCount = Object.values(enabled).filter(Boolean).length;
  const allOn = enabledCount === ALL_TARGETS.length;

  const selectAll = () => setEnabled(Object.fromEntries(ALL_TARGETS.map(t => [t.key, true])));
  const deselectAll = () => setEnabled(Object.fromEntries(ALL_TARGETS.map(t => [t.key, false])));

  const handleMassScan = () => {
    if (enabledCount === 0) {
      showAlert('⚠️ Sin selección', 'Seleccioná al menos una cuenta antes de ejecutar el escaneo.');
      return;
    }
    const selectedKeys = ALL_TARGETS.filter(t => enabled[t.key]).map(t => t.key);
    showConfirm(
      'Escaneo Masivo',
      `Esto iniciará el scraping real de ${enabledCount} cuenta${enabledCount > 1 ? 's' : ''} seleccionada${enabledCount > 1 ? 's' : ''}. El proceso toma ~${Math.ceil(enabledCount * 2)} minutos en segundo plano. ¿Iniciar?`,
      async () => {
        try {
          await axios.post(`${API_BASE}/api/admin/scout-all`, { selectedKeys });
          onMassScanStart?.();
        } catch (e) {
          showAlert('❌ Error', 'No se pudo iniciar el escaneo. Verificá el backend.');
        }
      }
    );
  };

  return (
    <section className="space-y-12 pb-20">
      <h1 className="pwa-title text-fg leading-tight">Panel de <br /><span className="text-fg/40">Configuración</span></h1>

      {/* ── Apify Quota Widget ─────────────────────────────────────────── */}
      {apifyUsage && (() => {
        const pct = Math.min(100, Math.round(((apifyUsage.usedUsd || 0) / (apifyUsage.limitUsd || 5)) * 100));
        const isHigh = pct > 75;
        return (
          <div className={`pwa-card p-6 flex flex-col md:flex-row gap-6 items-start md:items-center border
            ${isHigh ? 'border-accent-pink/30 bg-accent-pink/5' : 'border-accent-lemon/20 bg-accent-lemon/5'}`}>
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${isHigh ? 'bg-accent-pink shadow-[0_0_8px_rgba(255,83,186,0.6)]' : 'bg-accent-lemon shadow-[0_0_8px_rgba(152,255,188,0.5)]'}`} />
                <span className="text-[9px] font-black uppercase tracking-widest text-fg/40">Apify — Cuota Mensual</span>
                <span className="text-[8px] font-black uppercase text-fg/20 ml-auto">{apifyUsage.planName || 'Free'}</span>
              </div>
              <div className="flex items-end gap-2">
                <span className={`text-3xl font-black italic ${isHigh ? 'text-accent-pink' : 'text-accent-lemon'}`}>{pct}%</span>
                <span className="text-xs text-fg/40 pb-1 font-medium">
                  ${(apifyUsage.usedUsd || 0).toFixed(2)} / ${(apifyUsage.limitUsd || 5).toFixed(0)} USD
                </span>
              </div>
              <div className="h-2 w-full bg-fg/5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${isHigh ? 'bg-accent-pink' : pct > 50 ? 'bg-accent-orange' : 'bg-accent-lemon'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {apifyUsage.usedAcu > 0 && (
                <p className="text-[8px] text-fg/30 font-medium">{apifyUsage.usedAcu.toFixed(3)} Actor Compute Units consumidos</p>
              )}
            </div>
            {apifyUsage.nextResetDate && (
              <div className="text-right flex-shrink-0">
                <p className="text-[8px] uppercase font-black tracking-widest text-fg/20">Reset</p>
                <p className="text-sm font-black text-fg/40">{new Date(apifyUsage.nextResetDate).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}</p>
              </div>
            )}
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Sentiment Alerts */}
        <div className="pwa-card p-8 bg-fg/[0.02] border-fg/5 space-y-6">
          <div className="flex items-center gap-3 text-accent-orange">
            <Settings size={20} />
            <h3 className="text-xs font-black uppercase italic tracking-widest">Alertas de Sentimiento</h3>
          </div>
          <p className="text-xs text-fg/60 dark:text-fg/40 leading-relaxed font-medium italic">
            Define los umbrales críticos para disparar alertas automáticas al Directorio y Slack.
          </p>
          <div className="space-y-6 pt-4">
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] uppercase font-black tracking-widest opacity-60 text-fg">
                <span>Umbral de Crisis</span>
                <span className="text-accent-pink">30% Negativo</span>
              </div>
              <div className="h-1.5 w-full bg-fg/5 rounded-full overflow-hidden">
                <div className="h-full bg-accent-pink w-[30%] shadow-[0_0_10px_rgba(255,83,186,0.3)]" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] uppercase font-black tracking-widest opacity-60 text-fg">
                <span>Salud de Marca (Mínimo)</span>
                <span className="text-accent-lemon">70% Positivo</span>
              </div>
              <div className="h-1.5 w-full bg-fg/5 rounded-full overflow-hidden">
                <div className="h-full bg-accent-lemon w-[70%] shadow-[0_0_10px_rgba(152,255,188,0.3)]" />
              </div>
            </div>
          </div>
        </div>

        {/* Integration Status */}
        <div className="pwa-card p-8 bg-fg/[0.02] border-fg/5 space-y-6">
          <div className="flex items-center gap-3 text-fg/80">
            <Search size={20} />
            <h3 className="text-xs font-black uppercase italic tracking-widest text-fg">Integraciones de IA</h3>
          </div>
          <div className="grid grid-cols-1 gap-4 pt-2">
            <div className="flex items-center gap-2 px-3 py-2 bg-accent-lemon/10 rounded-xl border border-accent-lemon/20">
              <div className="w-1.5 h-1.5 bg-accent-lemon rounded-full animate-pulse" />
              <span className="text-[9px] font-black uppercase text-accent-lemon tracking-widest">Gemini 2.0 Flash Active</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-accent-orange/10 rounded-xl border border-accent-orange/20">
              <div className="w-1.5 h-1.5 bg-accent-orange rounded-full" />
              <span className="text-[9px] font-black uppercase text-accent-orange tracking-widest">Apify Scrapers Connected</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 pt-2">
            <div className="p-3 bg-fg/[0.03] rounded-xl border border-fg/5 text-center">
              <p className="text-[9px] font-black text-fg/30 uppercase tracking-widest">API Quota</p>
              <p className="text-lg font-black italic text-fg mt-1">14.2%</p>
            </div>
            <div className="p-3 bg-fg/[0.03] rounded-xl border border-fg/5 text-center">
              <p className="text-[9px] font-black text-fg/30 uppercase tracking-widest">Report</p>
              <p className="text-lg font-black italic uppercase text-fg mt-1">Semanal</p>
            </div>
            <div className="p-3 bg-fg/[0.03] rounded-xl border border-fg/5 text-center">
              <p className="text-[9px] font-black text-fg/30 uppercase tracking-widest">Versión</p>
              <p className="text-lg font-black italic uppercase text-fg mt-1">v2.5</p>
            </div>
          </div>
        </div>

        {/* Intelligence Matrix — ocupa todo el ancho */}
        <div className="pwa-card p-8 bg-fg/[0.02] border-fg/5 space-y-6 lg:col-span-2">
          {/* Header con controles */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 text-accent-lemon">
              <BarChart3 size={20} />
              <h3 className="text-xs font-black uppercase italic tracking-widest">Matriz de Inteligencia</h3>
              {/* Badge contador */}
              <span className={`ml-2 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                enabledCount === 0 ? 'bg-accent-pink/20 text-accent-pink' :
                enabledCount === ALL_TARGETS.length ? 'bg-accent-lemon/20 text-accent-lemon' :
                'bg-accent-orange/20 text-accent-orange'
              }`}>
                {enabledCount}/{ALL_TARGETS.length} seleccionadas
              </span>
            </div>

            <div className="flex gap-3 items-center flex-wrap">
              {/* Select/Deselect all */}
              <button
                onClick={allOn ? deselectAll : selectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-fg/5 text-fg/50 border border-fg/10 text-[9px] font-black uppercase italic rounded-full hover:bg-fg/10 transition-all"
              >
                {allOn ? <Square size={10} /> : <CheckSquare size={10} />}
                {allOn ? 'Deseleccionar todo' : 'Seleccionar todo'}
              </button>

              {/* Cold start */}
              <button
                onClick={() => showConfirm(
                  'Cold Start',
                  'Esto generará datos sintéticos realistas para los últimos 7 días de Despegar. ¿Continuar?',
                  async () => {
                    try {
                      const res = await axios.post(`${API_BASE}/api/admin/seed-history`);
                      showAlert('✅ Cold Start Completado', `Se insertaron ${res.data.inserted} días de historial.`);
                    } catch (e) {
                      showAlert('❌ Error', 'No se pudo conectar al servidor.');
                    }
                  }
                )}
                className="px-4 py-1.5 bg-fg/5 text-fg/60 border border-fg/10 text-[9px] font-black uppercase italic rounded-full hover:bg-fg/10 transition-all"
              >
                Cold Start
              </button>

              {/* Scan button */}
              <button
                onClick={handleMassScan}
                disabled={enabledCount === 0}
                className={`px-5 py-1.5 font-black text-[9px] uppercase italic rounded-full transition-all ${
                  enabledCount === 0
                    ? 'bg-fg/10 text-fg/30 cursor-not-allowed'
                    : 'bg-accent-lemon text-black hover:scale-105 shadow-[0_0_20px_rgba(152,255,188,0.3)]'
                }`}
              >
                {enabledCount === 0 ? 'Sin selección' : `Escanear ${enabledCount} cuenta${enabledCount > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto overflow-y-auto max-h-[500px] no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-bg z-10 border-b border-fg/5">
                <tr>
                  <th className="py-4 pr-4 text-[9px] font-black uppercase tracking-widest text-fg/50 w-10">
                    <span className="sr-only">Activar</span>
                  </th>
                  <th className="py-4 text-[9px] font-black uppercase tracking-widest text-fg/50">Marca</th>
                  <th className="py-4 text-[9px] font-black uppercase tracking-widest text-fg/50">Canal</th>
                  <th className="py-4 text-[9px] font-black uppercase tracking-widest text-fg/50">Handle</th>
                  <th className="py-4 text-[9px] font-black uppercase tracking-widest text-fg/50">Tipo</th>
                  <th className="py-4 text-[9px] font-black uppercase tracking-widest text-fg/50 text-center">Último Scan</th>
                  <th className="py-4 text-[9px] font-black uppercase tracking-widest text-fg/50 text-center">Scans</th>
                  <th className="py-4 text-[9px] font-black uppercase tracking-widest text-fg/50 text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-fg/[0.02]">
                {ALL_TARGETS.map((row) => {
                  const isOn = enabled[row.key];
                  const statusData = brandsStatus?.[row.brand];
                  const hasData = statusData && statusData.count > 0;
                  const dateObj = hasData && statusData.lastUpdated ? new Date(statusData.lastUpdated) : null;
                  const dateStr = dateObj
                    ? dateObj.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
                    : '—';
                  const count = hasData ? statusData.count : 0;

                  return (
                    <tr
                      key={row.key}
                      onClick={() => toggle(row.key)}
                      className={`group cursor-pointer transition-all border-b border-fg/[0.02] ${
                        isOn ? 'hover:bg-fg/[0.02]' : 'opacity-40 hover:opacity-60 hover:bg-fg/[0.01]'
                      }`}
                    >
                      {/* Toggle switch */}
                      <td className="py-4 pr-4">
                        <div
                          className={`relative w-8 h-4 rounded-full transition-all duration-300 ${
                            isOn ? 'bg-accent-lemon shadow-[0_0_8px_rgba(152,255,188,0.4)]' : 'bg-fg/10'
                          }`}
                        >
                          <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-bg shadow-sm transition-all duration-300 ${
                            isOn ? 'left-4' : 'left-0.5'
                          }`} />
                        </div>
                      </td>

                      <td className="py-4 text-xs font-black uppercase italic text-fg">{row.brand}</td>
                      <td className="py-4">
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${
                          row.platform === 'TikTok'
                            ? 'bg-white/5 border-white/10 text-fg/60'
                            : 'bg-accent-pink/5 border-accent-pink/20 text-accent-pink/80'
                        }`}>
                          {row.platform}
                        </span>
                      </td>
                      <td className="py-4 text-[10px] font-medium text-accent-orange italic">{row.handle}</td>
                      <td className="py-4">
                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${
                          row.type === 'Owned'
                            ? 'bg-accent-lemon/10 text-accent-lemon'
                            : 'bg-fg/5 text-fg/40'
                        }`}>
                          {row.type}
                        </span>
                      </td>
                      <td className="py-4 text-center text-[9px] font-black uppercase italic tracking-widest opacity-40 text-fg">{dateStr}</td>
                      <td className="py-4 text-center text-[10px] font-black uppercase italic text-accent-lemon">
                        {count > 0 ? `${count} Scans` : '0'}
                      </td>
                      <td className="py-4">
                        <div className="flex items-center justify-end gap-2">
                          <div className={`w-1 h-1 rounded-full ${hasData ? 'bg-accent-lemon animate-pulse' : 'bg-fg/20'}`} />
                          <span className="text-[9px] font-black uppercase tracking-tighter opacity-40 text-fg">
                            {hasData ? 'Tracking' : 'Pending'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-fg/20 font-medium italic">
            Hacé click en una fila para activar/desactivar esa cuenta. Solo las cuentas activas serán incluidas en el próximo escaneo.
          </p>
        </div>
      </div>
    </section>
  );
};

export default SettingsView;
