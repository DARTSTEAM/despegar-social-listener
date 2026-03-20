# 🚀 Hike Social Listener - Despegar v1.0

Este repositorio contiene el ecosistema de **Social Listening** diseñado para Despegar, enfocado en extraer e interpretar el sentimiento de las audiencias a través de **Google Cloud AI**.

---

## 📍 Arquitectura del Sistema

La aplicación utiliza una arquitectura híbrida en Google Cloud para maximizar la velocidad y escalabilidad:

1.  **Frontend (React/Vite):** Aplicación de una sola página (SPA) con estética **Hike Premium**. 
    *   **Hosting:** Firebase Hosting (`despegar-social-listener.web.app`).
2.  **Backend (Node.js/Express):** API robusta que maneja el scraping y el procesamiento de IA.
    *   **Servicio:** Cloud Run (`apiserver-despegar`).

---

## 📺 YouTube Sentimining (Entity Intelligence)

La funcionalidad estrella integrada exclusivamente con el canal oficial de **Despegar** (`UC_HTmhrhwj1j0qfYspRaM1A`):

*   **Sugerencias Inteligentes:** Al entrar a la sección, el sistema trae automáticamente:
    *   **5 Últimos Lanzamientos:** (Ordenados por fecha).
    *   **5 Videos Tendencia:** (Los más populares por vistas).
*   **Análisis Predictivo:** Al hacer clic en un video, se procesan los comentarios usando la **Google Natural Language API** para extraer marcas, productos y conceptos (entidades) con su sentimiento específico.
*   **Visualización:** Gráfico de Campana de Gauss para el sentimiento general y rankings de entidades críticas.

---

## 🎨 Design System: Hike Aesthetics

*   **Modo Premium:** Interfaz bloqueada en **Dark Mode** con fondo de malla granulada (*grainy mesh*).
*   **Tipografía:** Inter & Outfit (pesos livianos) para una lectura clara.
*   **Branding:** Favicon oficial de Despegar y paleta de colores curada (Pink, Lemon, Orange accents).

---

## 🚀 Cómo Desplegar

### 1. Backend (Cloud Run)
Desde la carpeta `/functions`:
```bash
gcloud run deploy apiserver-despegar --source . --region us-central1 --project hike-agentic-playground
```

### 2. Frontend (Firebase)
Desde la carpeta `/frontend`:
```bash
npm run build
npx firebase deploy --only hosting --project hike-agentic-playground
```

---

## 🔑 Configuración Requerida (Variables de Entorno)

Para que el sistema funcione, los siguientes secretos deben estar configurados en el entorno de Cloud Run:

| Variable | Uso |
| :--- | :--- |
| `YOUTUBE_API_KEY` | Crucial para consultar la YouTube Data API v3 (videos/comentarios). |
| `GEMINI_API_KEY` | Generación de insights con Gemini 1.5 Pro. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Acceso a la Google Natural Language API. |

---

> **Nota:** Este manual es un registro de la integración realizada en Marzo 2026. 🎯
