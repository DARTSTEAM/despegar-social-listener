// server.js — Cloud Run entrypoint (sin firebase-functions wrapper)
// Reutiliza el mismo app de Express definido en index.js

'use strict';
require('dotenv').config();

// index.js define `app` como Express y lo exporta via firebase-functions.
// Para Cloud Run lo levantamos directamente.
const { app } = require('./index');

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`[Backend] Servidor Cloud Run corriendo en puerto ${PORT}`);
});
