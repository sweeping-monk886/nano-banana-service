import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.service.logLevel,
  transport: { target: 'pino-pretty', options: { translateTime: 'SYS:standard', ignore: 'pid,hostname' } },
});
