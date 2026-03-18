# NGR Social Listener — Guía para colaboradores

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React + Vite + TailwindCSS |
| Backend | Firebase Cloud Functions (Node.js 22) |
| Base de datos | Cloud Firestore |
| Scraping | Apify (TikTok + Instagram) |
| IA | Google Gemini 1.5 Flash |
| CI/CD | GitHub Actions → Firebase Hosting |

---

## Setup inicial (una sola vez)

### 1. Prerrequisitos
- Node.js 20+
- Firebase CLI: `npm install -g firebase-tools`
- Tener acceso al repo en GitHub (`breajp/ngr-social-listener`)

### 2. Clonar el repo

```bash
git clone https://github.com/breajp/ngr-social-listener.git
cd ngr-social-listener
```

### 3. Instalar dependencias

```bash
# Frontend
cd frontend && npm install && cd ..

# Backend Functions
cd backend/functions && npm install && cd ../..
```

### 4. Variables de entorno

Crear el archivo `backend/functions/.env` (pedírselo a Juan Pablo, NO commitear):

```env
GEMINI_API_KEY=...
APIFY_API_KEY=...
```

### 5. Autenticarse en Firebase

```bash
firebase login
firebase use hike-agentic-playground
```

---

## Correr el proyecto localmente

```bash
# Terminal 1 — Frontend (http://localhost:5173)
cd frontend && npm run dev

# Terminal 2 — Backend local (http://localhost:3001)
cd backend && node src/server.js
```

El frontend en desarrollo apunta automáticamente al backend local.

---

## Flujo de trabajo

```
main (producción)
 └── feature/mi-feature  ← acá trabajás
```

1. Crear rama desde `main`:
   ```bash
   git checkout -b feature/nombre-de-tu-feature
   ```

2. Hacer cambios, commitear:
   ```bash
   git add -A
   git commit -m "feat: descripción clara del cambio"
   git push origin feature/nombre-de-tu-feature
   ```

3. Abrir Pull Request en GitHub hacia `main`
   - Esto genera automáticamente un **deploy de preview** en Firebase (URL temporal para revisar)

4. Una vez aprobado y mergeado a `main`:
   - GitHub Actions hace el **deploy a producción automáticamente** (~1 minuto)
   - Ver estado: https://github.com/breajp/ngr-social-listener/actions

---

## Estructura del proyecto

```
/
├── frontend/           # React + Vite (UI)
│   ├── src/
│   │   ├── App.jsx     # Componente principal + todas las vistas
│   │   └── index.css   # Design system (CSS variables, tokens)
│   └── index.html
│
├── backend/
│   ├── functions/      # 🔥 Firebase Cloud Functions (PRODUCCIÓN)
│   │   ├── index.js    # Todas las rutas de API + funciones programadas
│   │   └── processor.js # Lógica de Gemini + análisis de sentimiento
│   └── src/            # Servidor local Express (DESARROLLO)
│       └── server.js
│
├── .github/
│   └── workflows/
│       ├── firebase-hosting-merge.yml    # Deploy en push a main
│       └── firebase-hosting-pull-request.yml  # Preview en PRs
│
├── firebase.json       # Config Firebase (hosting + functions)
└── .firebaserc         # Proyecto Firebase activo
```

---

## URLs importantes

| Recurso | URL |
|---|---|
| App en producción | https://hike-agentic-playground.web.app |
| Repo GitHub | https://github.com/breajp/ngr-social-listener |
| Firebase Console | https://console.firebase.google.com/project/hike-agentic-playground |
| GitHub Actions | https://github.com/breajp/ngr-social-listener/actions |

---

## APIs disponibles (Backend)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/history` | Historial de scans de Firestore |
| GET | `/api/cuantico/summary` | Resumen de sentimiento por marca |
| GET | `/api/admin/brands-status` | Estado de todos los perfiles monitoreados |
| POST | `/api/scout` | Lanzar scraping de una URL |
| POST | `/api/admin/scout-all` | Escaneo masivo de todas las marcas |
| POST | `/api/admin/seed-history` | Poblar 7 días de historial sintético |

---

## Convenciones de commits

```
feat:     nueva funcionalidad
fix:      corrección de bug
ui:       cambios visuales/diseño
ci:       cambios en pipeline de deploy
docs:     documentación
refactor: refactorización sin cambio de funcionalidad
```
