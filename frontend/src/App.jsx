import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3, Search, Filter, Settings, Home, Youtube, TrendingUp, Sun, Moon
} from 'lucide-react';
import axios from 'axios';

import BrandLogo from './components/BrandLogo';
import Modal from './components/Modal';
import { useAppData } from './hooks/useAppData';
import { API_BASE } from './config';

import LandingPage from './views/LandingPage';
import DashboardView from './views/DashboardView';
import YouTubeSection from './views/YouTubeSection';
import ScoutBotView from './views/ScoutBotView';
import HistoryView from './views/HistoryView';
import SettingsView from './views/SettingsView';
import PostsView from './views/PostsView';
import ScoutProgressWidget from './components/ScoutProgressWidget';

const NAV_ITEMS = [
  { id: 'home',     label: 'Inicio',       icon: Home        },
  { id: 'insights', label: 'Dashboard',    icon: BarChart3   },
  { id: 'youtube',  label: 'Sentimining',  icon: Youtube     },
  { id: 'scout',    label: 'Scout Bot',    icon: Search      },
  { id: 'history',  label: 'Historial',    icon: Filter      },
  { id: 'posts',    label: 'Posts',        icon: TrendingUp  },
  { id: 'settings', label: 'Ajustes',      icon: Settings    },
];

export default function App() {
  // ─── Navigation & UI ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('home');
  const [theme, setTheme] = useState('dark');
  const [modal, setModal] = useState(null);

  // ─── History filter state ─────────────────────────────────────────────────
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('');

  // ─── Scout Bot state ───────────────────────────────────────────────────────
  const [url, setUrl] = useState('');
  const [platform, setPlatform] = useState('tiktok');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapedData, setScrapedData] = useState([]);
  const [insights, setInsights] = useState(null);
  const [scoutError, setScoutError] = useState(null);
  const pollRef = useRef(null);
  const timeoutRef = useRef(null);

  // ─── Remote data via custom hook ──────────────────────────────────────────
  const { history, alerts, historicalData, brandsStatus, report, isUsingMockData, isBackendDown, isEmptyData, isLoading } =
    useAppData(activeTab, selectedBrand, selectedPlatform);

  // ─── Mass scan state ──────────────────────────────────────────────────────
  const [isMassScanRunning, setIsMassScanRunning] = useState(false);

  // ─── Theme toggle ─────────────────────────────────────────────────────────
  useEffect(() => {
    const root = window.document.documentElement;
    theme === 'light' ? root.classList.add('light') : root.classList.remove('light');
  }, [theme]);

  // ─── Cleanup polling on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // ─── Modal helpers ────────────────────────────────────────────────────────
  const showConfirm = (title, message, onConfirm) => setModal({ title, message, onConfirm, type: 'confirm' });
  const showAlert = (title, message) => setModal({ title, message, type: 'alert' });
  const closeModal = () => setModal(null);

  // ─── Scout Bot: scrape + poll ─────────────────────────────────────────────
  const handleScout = async () => {
    if (!url) return;
    if (pollRef.current) clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    setIsScraping(true);
    setScrapedData([]);
    setInsights(null);
    setScoutError(null);

    try {
      // /api/scout ahora es síncrono — espera hasta recibir los resultados completos
      const res = await axios.post(`${API_BASE}/api/scout`, {
        url, platform,
        brand: url.includes('bembos') ? 'Bembos'
             : url.includes('popeyes') ? 'Popeyes'
             : url.includes('papajohns') ? 'Papa Johns'
             : url.includes('dunkin') ? 'Dunkin'
             : url.includes('kfc') ? 'KFC'
             : url.includes('starbucks') ? 'Starbucks'
             : platform,
      }, { timeout: 280000 }); // 280 segundos (por debajo del timeout de Cloud Run de 300s)

      if (res.data.comments > 0) {
        setScrapedData(res.data.comments_raw || []);
        setInsights(res.data);
      } else {
        setScoutError('No se encontraron comentarios en esta URL.');
      }
    } catch (err) {
      if (err.code === 'ECONNABORTED') {
        setScoutError('Tiempo de espera agotado. Intentá con menos comentarios o probá más tarde.');
      } else {
        setScoutError(err.response?.data?.error || err.message);
      }
    } finally {
      setIsScraping(false);
    }
  };


  return (
    <div className="min-h-screen relative p-6 md:p-12 text-fg overflow-x-hidden">
      <div className="pwa-mesh">
        <div className="mesh-orb-1 opacity-20" />
        <div className="mesh-orb-2 opacity-10" />
      </div>

      {/* Banner Modo Demo — protege al management de ver datos sintéticos sin aviso */}
      {/* Banner: backend caído — solo mostrar después de que terminó de cargar */}
      {!isLoading && isBackendDown && activeTab !== 'home' && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-2.5 bg-accent-pink/90 backdrop-blur-md border border-accent-pink text-white rounded-full shadow-2xl shadow-accent-pink/30 animate-pulse">
          <div className="w-2 h-2 bg-white/40 rounded-full" />
          <span className="text-[10px] font-black uppercase tracking-widest">Backend no responde — verificá la conexión</span>
        </div>
      )}

      {/* Banner: backend OK pero sin datos todavía */}
      {!isLoading && isEmptyData && !isBackendDown && activeTab !== 'home' && activeTab !== 'settings' && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-2.5 bg-fg/90 backdrop-blur-md border border-fg/20 text-bg rounded-full shadow-2xl">
          <div className="w-2 h-2 bg-bg/40 rounded-full" />
          <span className="text-[10px] font-black uppercase tracking-widest">Sin datos aún — ejecutá el Escaneo Masivo en Configuración</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Sidebar */}
        <aside className="lg:col-span-3 flex flex-col min-h-[calc(100vh-6rem)] sticky top-12">
          <BrandLogo onNavigate={setActiveTab} />

          <nav className="space-y-2">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all font-black italic uppercase text-xs tracking-widest ${
                  activeTab === item.id
                    ? 'bg-accent-orange text-white shadow-lg shadow-accent-orange/20 scale-[1.02]'
                    : 'text-fg/40 hover:bg-fg/5 hover:text-fg'
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto flex justify-center pb-8">
            <button
              onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
              className="w-12 h-12 flex items-center justify-center rounded-2xl bg-fg/[0.03] border border-fg/10 text-fg hover:bg-fg/[0.08] transition-all hover:scale-[1.05] active:scale-95 group relative overflow-hidden shadow-lg shadow-black/5"
              title={theme === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
            >
              <div className="absolute inset-0 bg-accent-orange/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <motion.div
                key={theme}
                initial={{ scale: 0.5, opacity: 0, rotate: -90 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              >
                {theme === 'dark'
                  ? <Moon size={20} className="text-accent-orange" />
                  : <Sun size={20} className="text-accent-orange" />
                }
              </motion.div>
            </button>
          </div>
        </aside>

        {/* Main content area */}
        <main className="lg:col-span-9 space-y-12">
          {activeTab === 'home' && (
            <LandingPage onEnter={() => setActiveTab('insights')} />
          )}
          {activeTab === 'insights' && (
            <DashboardView history={history} alerts={alerts} report={report} />
          )}
          {activeTab === 'youtube' && (
            <YouTubeSection />
          )}
          {activeTab === 'scout' && (
            <ScoutBotView
              platform={platform}
              setPlatform={setPlatform}
              url={url}
              setUrl={setUrl}
              handleScout={handleScout}
              isScraping={isScraping}
              insights={insights}
              scrapedData={scrapedData}
              error={scoutError}
            />
          )}
          {activeTab === 'history' && (
            <HistoryView
              selectedBrand={selectedBrand}
              setSelectedBrand={setSelectedBrand}
              selectedPlatform={selectedPlatform}
              setSelectedPlatform={setSelectedPlatform}
              historicalData={history}
            />
          )}
          {activeTab === 'posts' && (
            <PostsView />
          )}
          {activeTab === 'settings' && (
            <SettingsView
              brandsStatus={brandsStatus}
              showConfirm={showConfirm}
              showAlert={showAlert}
              onMassScanStart={() => setIsMassScanRunning(true)}
            />
          )}
        </main>
      </div>

      <Modal modal={modal} closeModal={closeModal} />

      {/* Widget de progreso del escaneo masivo — esquina inferior derecha */}
      <ScoutProgressWidget
        isScanning={isMassScanRunning}
        onScanComplete={() => {
          setIsMassScanRunning(false);
          showAlert('✅ Escaneo Completado', 'El escaneo masivo finalizó. Los datos ya están disponibles en el Dashboard.');
        }}
      />
    </div>
  );
}
