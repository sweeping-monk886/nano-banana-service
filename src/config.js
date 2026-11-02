import 'dotenv/config';

function req(key) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env: ${key}`);
  return v;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  feishu: {
    appId: req('FEISHU_APP_ID'),
    appSecret: req('FEISHU_APP_SECRET'),
    mainAppToken: req('FEISHU_MAIN_APP_TOKEN'),
    mainTableId: req('FEISHU_MAIN_TABLE_ID'),
    libAppToken: req('FEISHU_LIB_APP_TOKEN'),
    libTableId: req('FEISHU_LIB_TABLE_ID'),
  },
  nano: {
    baseUrl: req('NANO_BASE_URL'),
    apiKey: req('NANO_API_KEY'),
    model: process.env.NANO_MODEL || 'nano-banana-2',
    aspectRatio: process.env.NANO_ASPECT_RATIO || '9:16',
    imageSize: process.env.NANO_IMAGE_SIZE || '4K',
    maxAttempts: Math.floor(positiveNumber(process.env.NANO_MAX_ATTEMPTS, 1)),
  },
  openai: {
    baseUrl: req('OPENAI_BASE_URL').replace(/\/+$/, ''),
    apiKey: req('OPENAI_API_KEY'),
    model: process.env.OPENAI_MODEL || 'gpt-5.4',
    timeoutMs: Math.max(1_000, positiveNumber(process.env.OPENAI_TIMEOUT_MS, 90_000)),
    fallbackBaseUrl: (process.env.CAPTION_FALLBACK_BASE_URL || `${new URL(req('NANO_BASE_URL')).origin}/v1`).replace(/\/+$/, ''),
    fallbackApiKey: process.env.CAPTION_FALLBACK_API_KEY || req('NANO_API_KEY'),
    fallbackModel: process.env.CAPTION_FALLBACK_MODEL || 'gemini-3.5-flash',
    fallbackTimeoutMs: Math.max(1_000, positiveNumber(process.env.CAPTION_FALLBACK_TIMEOUT_MS, 120_000)),
  },
  imageUpload: {
    maxBytes: positiveNumber(process.env.FEISHU_IMAGE_MAX_MB, 18) * 1024 * 1024,
    format: String(process.env.FEISHU_IMAGE_FORMAT || 'png').toLowerCase(),
    jpegQuality: Math.min(100, Math.max(80, positiveNumber(process.env.FEISHU_JPEG_QUALITY, 95))),
  },
  wechat: {
    webhook: process.env.WECHAT_WEBHOOK || '',
    text: process.env.WECHAT_NOTIFY_TEXT || '图片已生成完毕',
  },
  service: {
    port: Math.floor(positiveNumber(process.env.PORT, 3000)),
    maxRecordsPerRun: Math.max(0, Math.floor(Number.isFinite(Number(process.env.MAX_RECORDS_PER_RUN)) ? Number(process.env.MAX_RECORDS_PER_RUN) : 0)),
    recordConcurrency: Math.floor(positiveNumber(process.env.RECORD_CONCURRENCY, 2)),
    logLevel: process.env.LOG_LEVEL || 'info',
  },
  prompts: {
    whiteBackgroundNumber: process.env.WHITE_BACKGROUND_NUMBER || '77',
    beigeBackgroundNumber: process.env.BEIGE_BACKGROUND_NUMBER || '78',
  },
};
