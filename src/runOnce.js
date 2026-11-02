import { runOnce } from './pipeline.js';
import { logger } from './logger.js';

runOnce()
  .then(r => { logger.info({ r }, 'done'); process.exit(0); })
  .catch(e => { logger.error({ err: e.message, stack: e.stack }, 'failed'); process.exit(1); });
