// ─── API Base URL ─────────────────────────────────────────────────────────────
// Configurable via .env.local (VITE_API_URL=http://localhost:3001)
// En producción con Firebase Hosting + rewrite, dejar vacío.
export const API_BASE = import.meta.env.VITE_API_URL || '';
