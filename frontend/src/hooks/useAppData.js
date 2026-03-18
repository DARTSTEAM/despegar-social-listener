import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../config';

/**
 * Hook que centraliza todo el data fetching del dashboard.
 * isBackendDown = true SOLO si el backend no responde (error de red).
 * isEmptyData   = true si el backend responde pero Firestore está vacío.
 */
export function useAppData(activeTab, selectedBrand, selectedPlatform) {
  const [history, setHistory] = useState([]);
  const [cuanticoInsights, setCuanticoInsights] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [historicalData, setHistoricalData] = useState([]);
  const [brandsStatus, setBrandsStatus] = useState({});
  const [report, setReport] = useState(null);
  const [isBackendDown, setIsBackendDown] = useState(false);
  const [isEmptyData, setIsEmptyData] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (activeTab === 'home') { setIsLoading(false); return; }

    const fetchAll = async () => {
      setIsLoading(true);
      // Verificar conectividad — Cloud Functions puede tardar ~15s en cold start.
      // Intentamos 3 veces antes de declarar el backend caído.
      let backendReachable = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await axios.get(`${API_BASE}/api/admin/brands-status`, { timeout: 20000 });
          backendReachable = true;
          break;
        } catch (e) {
          console.warn(`[useAppData] Ping intento ${attempt}/3 fallido:`, e.message);
          if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
        }
      }

      if (!backendReachable) {
        setIsBackendDown(true);
        setIsEmptyData(false);
        setIsLoading(false);
        return;
      }

      setIsBackendDown(false);

      try {
        const [cuanticoRes, historyRes, alertsRes, historicalRes, reportRes, statusRes] = await Promise.all([
          axios.get(`${API_BASE}/api/cuantico/summary`).catch(() => ({ data: [] })),
          axios.get(`${API_BASE}/api/history`).catch(() => ({ data: [] })),
          axios.get(`${API_BASE}/api/alerts`).catch(() => ({ data: [] })),
          axios.get(`${API_BASE}/api/historical`, { params: { brand: selectedBrand, platform: selectedPlatform } }).catch(() => ({ data: [] })),
          axios.get(`${API_BASE}/api/reports`).catch(() => ({ data: null })),
          axios.get(`${API_BASE}/api/admin/brands-status`).catch(() => ({ data: {} })),
        ]);

        setCuanticoInsights(Array.isArray(cuanticoRes.data) ? cuanticoRes.data : []);
        setBrandsStatus(statusRes.data && typeof statusRes.data === 'object' && !Array.isArray(statusRes.data) ? statusRes.data : {});

        const backHistory = Array.isArray(historyRes.data) ? historyRes.data : [];
        setHistory(backHistory);

        setAlerts(Array.isArray(alertsRes.data) ? alertsRes.data : []);

        const backData = Array.isArray(historicalRes.data) ? historicalRes.data : [];
        setHistoricalData(backData);

        // Reporte: solo si es un objeto real (no array, no null)
        const reportData = reportRes.data && typeof reportRes.data === 'object' && !Array.isArray(reportRes.data)
          ? reportRes.data : null;
        setReport(reportData);

        const hasRealData = backHistory.length > 0;
        setIsEmptyData(!hasRealData);
        setIsLoading(false);

      } catch (e) {
        console.error('[useAppData] Error fetching data:', e);
        setIsLoading(false);
      }
    };

    fetchAll();
  }, [activeTab, selectedBrand, selectedPlatform]);

  // Compatibilidad con código anterior que usaba isUsingMockData
  const isUsingMockData = isBackendDown;

  return { history, cuanticoInsights, alerts, historicalData, brandsStatus, report, isUsingMockData, isBackendDown, isEmptyData, isLoading };
}
