# Social Listening AI Agent - ABN Digital

Ecosistema de agentes inteligentes para automatizar el procesamiento de datos de redes sociales y detección de tendencias.

## Arquitectura
- **Connectors**: Integraciones con Cuántico y Apify.
- **Agents**: Lógica de procesamiento de sentimiento y detección de insights con Gemini Flash.
- **Notifications**: Entrega de resultados a Slack/Email.

## Setup
1. Clonar el repositorio.
2. `npm install`
3. Configurar `.env` (Basado en `.env.example`).
4. Correr con `node src/index.js`.

## ROADMAP INMEDIATO
- [ ] Mock de datos de Cuántico.
- [ ] Integración con Scrapers de Apify (TikTok/IG).
- [ ] Prompt Engineering para Sentiment & Topics.
- [ ] Generador de reportes semanales.
