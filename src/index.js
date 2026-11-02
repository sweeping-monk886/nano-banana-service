import express from 'express';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { logger } from './logger.js';
import { runOnce } from './pipeline.js';

export function createApp(run = runOnce) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  let inFlight = null;

  function startRun(res) {
    if (inFlight) {
      return res.status(202).json({ status: 'already_running' });
    }
    inFlight = (async () => {
      try {
        const r = await run();
        logger.info({ r }, 'run finished');
      } catch (e) {
        logger.error({ err: e.message, stack: e.stack }, 'run crashed');
      } finally {
        inFlight = null;
      }
    })();
    return res.status(202).json({ status: 'started' });
  }

  app.get('/health', (_, res) => res.json({ ok: true, service: 'nano-banana-service' }));

  app.post('/nano', async (_req, res) => startRun(res));

  app.post('/nano/sync', async (_req, res) => {
    if (inFlight) return res.status(409).json({ error: 'already_running' });
    try {
      inFlight = run();
      const r = await inFlight;
      res.json(r);
    } catch (e) {
      res.status(500).json({ error: e.message });
    } finally {
      inFlight = null;
    }
  });

  return app;
}

export const app = createApp();

export function startServer() {
  return app.listen(config.service.port, () => {
    logger.info({ port: config.service.port }, 'nano-banana-service listening');
  });
}

// Convert both sides to native paths; URL string comparison fails on Windows.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer();
}
