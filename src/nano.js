import axios from 'axios';
import sharp from 'sharp';
import { config } from './config.js';
import { logger } from './logger.js';

function parseResponse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const lines = text.split(/\n+/).map(line => line.replace(/^data:\s*/, '').trim()).filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        return JSON.parse(lines[index]);
      } catch {
        // Continue through streamed response lines.
      }
    }
  }
  throw new Error('no parseable JSON in response: ' + text.slice(0, 300));
}

function imageUrlFromResponse(payload) {
  const seen = new Set();
  const findUrl = value => {
    if (!value || typeof value !== 'object' || seen.has(value)) return '';
    seen.add(value);
    if (typeof value.url === 'string' && /^https?:\/\//.test(value.url)) return value.url;
    if (typeof value.image_url === 'string' && /^https?:\/\//.test(value.image_url)) return value.image_url;
    if (typeof value.image_url?.url === 'string' && /^https?:\/\//.test(value.image_url.url)) return value.image_url.url;
    if (typeof value.inlineData?.data === 'string' && value.inlineData.data) {
      const mime = value.inlineData.mimeType || 'image/png';
      return `data:${mime};base64,${value.inlineData.data}`;
    }
    for (const child of Object.values(value)) {
      const url = findUrl(child);
      if (url) return url;
    }
    return '';
  };
  const url = findUrl(payload);
  if (!url) throw new Error('no image URL in response: ' + JSON.stringify(payload).slice(0, 300));
  return url;
}

async function toInlineData(url) {
  const dataMatch = String(url || '').match(/^data:([^;]+);base64,(.+)$/s);
  const source = dataMatch
    ? Buffer.from(dataMatch[2], 'base64')
    : Buffer.from((await axios.get(url, { responseType: 'arraybuffer', timeout: 600_000 })).data);
  // Generated 4K PNGs can be tens of megabytes. Compress references before
  // embedding them in the next request so the provider's request limit is not hit.
  const compressed = await sharp(source)
    .rotate()
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  return {
    inlineData: {
      mimeType: 'image/jpeg',
      data: compressed.toString('base64'),
    },
  };
}

export async function nanoBanana({ prompt, urls, referenceLabels = [], maxAttempts = config.nano.maxAttempts }) {
  // Temporary Feishu URLs are downloaded once. Retrying only the Nano request
  // avoids repeated compression work and prevents URLs expiring mid-retry.
  const images = await Promise.all(urls.map(toInlineData));
  const parts = [{ text: prompt }];
  images.forEach((image, index) => {
    if (referenceLabels[index]) parts.push({ text: referenceLabels[index] });
    parts.push(image);
  });
  const endpoint = `${config.nano.baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(config.nano.model)}:generateContent`;
  const body = {
    contents: [{
      role: 'user',
      parts,
    }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio: config.nano.aspectRatio,
        imageSize: config.nano.imageSize,
      },
    },
  };
  logger.info({
    endpoint,
    model: config.nano.model,
    referenceImages: urls.length,
    bodyBytes: Buffer.byteLength(JSON.stringify(body)),
  }, 'nano-banana request');

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await axios.post(
        endpoint,
        body,
        {
          headers: {
            Authorization: `Bearer ${config.nano.apiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'text',
          transformResponse: [data => data],
          timeout: 6_000_000,
        },
      );
      const parsed = parseResponse(String(res.data || ''));
      return { url: imageUrlFromResponse(parsed), raw: parsed };
    } catch (error) {
      const responsePreview = typeof error.response?.data === 'string'
        ? error.response.data.slice(0, 500)
        : JSON.stringify(error.response?.data || {}).slice(0, 500);
      const status = error.response?.status;
      const retryable = !status || [408, 409, 425, 429, 500, 502, 503, 504].includes(status);
      if (attempt >= maxAttempts || !retryable) throw error;
      const wait = 3000 * attempt;
      logger.warn({ attempt, wait, status: error.response?.status, responsePreview, err: error.message }, 'nano-banana retry');
      await new Promise(resolve => setTimeout(resolve, wait));
    }
  }
  throw new Error('nano-banana exhausted retries');
}
