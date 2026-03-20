/**
 * server.js — Cloud Run entrypoint (standalone)
 */
'use strict';
require('dotenv').config();

// index.js defines `app` (Express) and exports it.
const { app } = require('./index');

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`[Backend-Despegar] Standalone server running on port ${PORT}`);
    console.log(`[Config] Project: hike-agentic-playground`);
});
