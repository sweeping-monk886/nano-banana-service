import axios from 'axios';
import { config } from './config.js';
import { logger } from './logger.js';

export async function notifyWeChat(text = config.wechat.text) {
  if (!config.wechat.webhook) return;
  try {
    await axios.post(config.wechat.webhook, {
      msgtype: 'text',
      text: { content: text },
    }, { timeout: 30_000 });
    logger.info('wechat notify sent');
  } catch (e) {
    logger.warn({ err: e.message }, 'wechat notify failed');
  }
}
