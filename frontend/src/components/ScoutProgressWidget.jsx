import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { API_BASE } from '../config';
import { X, ChevronDown, ChevronUp, Zap, CheckCircle, AlertCircle, Loader } from 'lucide-react';

const POLL_INTERVAL = 4000; // ms

const STATUS_ICON = {
  pending: <div className="w-2 h-2 rounded-full bg-fg/20 shrink-0" />,
  scraping: <Loader size={10} className="text-accent-orange animate-spin shrink-0" />,
  analyzing: <Loader size={10} className="text-accent-orange animate-spin shrink-0" />,
  gemini: <Zap size={10} className="text-accent-lemon animate-pulse shrink-0" />,
  done: <CheckCircle size={10} className="text-accent-lemon shrink-0" />,
  error: <AlertCircle size={10} className="text-accent-pink shrink-0" />,
};

const STATUS_LABEL = {
  pending: 'En cola',
  scraping: 'Raspando...',
  analyzing: 'Apify procesando...',
  gemini: 'Gemini analizando...',
  done: 'Completado',
  error: 'Error',
};

const platformIcon = (p) => {
  if (p === 'tiktok') return '🎵';
  if (p === 'instagram') return '📸';
  if (p === 'google-maps') return '📍';
  return '🌐';
};

export default function ScoutProgressWidget({ isScanning, onScanComplete }) {
  const [scanStatus, setScanStatus] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const pollRef = useRef(null);

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/admin/scout-status`);
        const data = res.data;
        setScanStatus(data);
        setDismissed(false);

        // Detener polling si terminó
        if (data.status === 'done' || data.status === 'error' || data.status === 'idle') {
          clearInterval(pollRef.current);
          if (data.status === 'done') onScanComplete?.();
        }
      } catch (e) {
        // silencioso
      }
    }, POLL_INTERVAL);
  };

  // Arrancar polling cuando el padre lo activa
  useEffect(() => {
    if (isScanning) {
      setDismissed(false);
      setCollapsed(false);
      // Pequeño delay para que Firestore tenga el doc listo
      setTimeout(startPolling, 2000);
    }
    return () => clearInterval(pollRef.current);
  }, [isScanning]);

  // Chequear al montar si hay un scan en curso (silencioso)
  useEffect(() => {
    const checkOnMount = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/admin/scout-status`, { timeout: 5000 });
        if (res.data?.status === 'running') {
          setScanStatus(res.data);
          startPolling();
        }
      } catch (e) {
        // Silencioso — el backend puede no estar activo localmente
      }
    };
    checkOnMount();
    return () => clearInterval(pollRef.current);
  }, []);

  const isVisible = scanStatus &&
    (scanStatus.status === 'running' || scanStatus.status === 'done' || scanStatus.status === 'error') &&
    !dismissed;

  if (!isVisible) return null;

  const { status, total = 0, completed = 0, failed = 0, currentBrand, currentPlatform, items: rawItems, startedAt } = scanStatus;
  // Firestore a veces serializa arrays vacíos como {} — siempre forzar array
  const items = Array.isArray(rawItems) ? rawItems : [];
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isRunning = status === 'running';
  const isDone = status === 'done';
  const isError = status === 'error';

  const elapsed = startedAt
    ? Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)
    : 0;
  const elapsedStr = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

  return (
    <AnimatePresence>
      <motion.div
        key="scout-widget"
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="fixed bottom-6 right-6 z-50 w-80 rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          background: 'rgba(10, 10, 10, 0.92)',
          backdropFilter: 'blur(20px)',
          borderColor: isRunning ? 'rgba(255, 150, 0, 0.3)' : isDone ? 'rgba(152, 255, 188, 0.3)' : 'rgba(255, 83, 186, 0.3)',
          boxShadow: isRunning
            ? '0 0 40px rgba(255, 150, 0, 0.15), 0 20px 60px rgba(0,0,0,0.5)'
            : isDone
              ? '0 0 40px rgba(152, 255, 188, 0.15), 0 20px 60px rgba(0,0,0,0.5)'
              : '0 0 40px rgba(255, 83, 186, 0.15), 0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-fg/5">
          <div className="flex items-center gap-2.5">
            {isRunning && <div className="w-2 h-2 rounded-full bg-accent-orange animate-pulse" />}
            {isDone && <div className="w-2 h-2 rounded-full bg-accent-lemon shadow-[0_0_6px_rgba(152,255,188,0.6)]" />}
            {isError && <div className="w-2 h-2 rounded-full bg-accent-pink" />}
            <span className="text-[10px] font-black uppercase tracking-widest text-fg">
              {isRunning ? 'Escaneo Masivo' : isDone ? '✓ Escaneo Completado' : '✗ Error en Escaneo'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCollapsed(c => !c)}
              className="p-1.5 rounded-lg hover:bg-fg/10 text-fg/40 hover:text-fg transition-all"
            >
              {collapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {!isRunning && (
              <button
                onClick={() => setDismissed(true)}
                className="p-1.5 rounded-lg hover:bg-fg/10 text-fg/40 hover:text-fg transition-all"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 w-full bg-fg/5">
          <motion.div
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className={`h-full ${isDone ? 'bg-accent-lemon' : isError ? 'bg-accent-pink' : 'bg-accent-orange'}`}
            style={{ boxShadow: isRunning ? '0 0 8px rgba(255,150,0,0.4)' : undefined }}
          />
        </div>

        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Stats row */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-fg/[0.04]">
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-[10px] font-black text-fg">{completed}/{total}</p>
                    <p className="text-[8px] uppercase text-fg/30 font-black">Completados</p>
                  </div>
                  {failed > 0 && (
                    <div className="text-center">
                      <p className="text-[10px] font-black text-accent-pink">{failed}</p>
                      <p className="text-[8px] uppercase text-fg/30 font-black">Errores</p>
                    </div>
                  )}
                  <div className="text-center">
                    <p className="text-[10px] font-black text-fg">{progress}%</p>
                    <p className="text-[8px] uppercase text-fg/30 font-black">Progreso</p>
                  </div>
                </div>
                {isRunning && (
                  <div className="text-right">
                    <p className="text-[9px] font-black text-fg/40">{elapsedStr}</p>
                    <p className="text-[8px] uppercase text-fg/20 font-black">Elapsed</p>
                  </div>
                )}
              </div>

              {/* Current brand (only while running) */}
              {isRunning && currentBrand && (
                <div className="px-4 py-2.5 border-b border-fg/[0.04] flex items-center gap-2">
                  <Loader size={10} className="text-accent-orange animate-spin shrink-0" />
                  <p className="text-[10px] font-black text-accent-orange uppercase">
                    {platformIcon(currentPlatform)} {currentBrand}
                    <span className="text-fg/30 normal-case font-medium ml-1">— {currentPlatform}</span>
                  </p>
                </div>
              )}

              {/* Items list */}
              <div className="max-h-48 overflow-y-auto px-3 py-2 space-y-1 no-scrollbar">
                {items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2.5 py-1.5 px-1 rounded-lg hover:bg-fg/[0.03] transition-all">
                    {STATUS_ICON[item.status] || STATUS_ICON.pending}
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-black uppercase text-fg/70 truncate">
                        {platformIcon(item.platform)} {item.brand}
                        <span className="text-fg/30 ml-1 normal-case font-medium">— {item.platform}</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {item.status === 'done' && item.commentsCount > 0 && (
                        <p className="text-[8px] font-black text-accent-lemon">{item.commentsCount} coment.</p>
                      )}
                      {item.status === 'error' && (
                        <p className="text-[8px] font-black text-accent-pink">Error</p>
                      )}
                      {(item.status === 'pending' || item.status === 'scraping' || item.status === 'analyzing' || item.status === 'gemini') && (
                        <p className="text-[8px] text-fg/20 uppercase font-black">{STATUS_LABEL[item.status]}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              {isDone && (
                <div className="px-4 py-2.5 border-t border-fg/[0.04] text-center">
                  <p className="text-[9px] font-black uppercase text-accent-lemon">
                    ✓ Dashboard actualizado — Recargá para ver los datos nuevos
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
