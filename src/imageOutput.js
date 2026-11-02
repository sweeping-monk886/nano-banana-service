import axios from 'axios';
import sharp from 'sharp';
import { config } from './config.js';

export async function readImageBuffer(url, timeoutMs = 600_000) {
  const match = String(url || '').match(/^data:([^;]+);base64,(.+)$/s);
  if (match) return Buffer.from(match[2], 'base64');
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: timeoutMs });
  return Buffer.from(response.data);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function colorStats(buffer) {
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .resize({ width: 128, height: 128, fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sums = [0, 0, 0];
  const squares = [0, 0, 0];
  const count = data.length / info.channels;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = data[offset + channel];
      sums[channel] += value;
      squares[channel] += value * value;
    }
  }
  return sums.map((sum, channel) => {
    const mean = sum / count;
    return {
      mean,
      standardDeviation: Math.sqrt(Math.max(1, squares[channel] / count - mean * mean)),
    };
  });
}

export async function assertTransparentPng(buffer) {
  const meta = await sharp(buffer).metadata();
  if (meta.format !== 'png' || !meta.hasAlpha || (meta.channels || 0) < 4) {
    throw new Error('无背景模式要求带透明 Alpha 通道的 PNG');
  }
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .resize({ width: 96, height: 96, fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alphaOffset = info.channels - 1;
  let transparent = 0;
  for (let offset = alphaOffset; offset < data.length; offset += info.channels) {
    if (data[offset] < 250) transparent += 1;
  }
  if (transparent === 0) throw new Error('无背景模式返回的 PNG 没有透明区域');
  return true;
}

// Match only small global tone differences. Geometry, texture and details remain untouched.
async function matchPngColor(original, reference) {
  const [sourceStats, targetStats] = await Promise.all([
    colorStats(original),
    colorStats(reference),
  ]);
  const gains = sourceStats.map((source, channel) => clamp(
    targetStats[channel].standardDeviation / source.standardDeviation,
    0.92,
    1.08,
  ));
  const offsets = sourceStats.map((source, channel) => clamp(
    targetStats[channel].mean - source.mean * gains[channel],
    -12,
    12,
  ));
  const meta = await sharp(original).metadata();
  const alphaGain = (meta.channels || 3) === 4 ? [1] : [];
  const alphaOffset = (meta.channels || 3) === 4 ? [0] : [];
  return sharp(original)
    .rotate()
    .linear([...gains, ...alphaGain], [...offsets, ...alphaOffset])
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
    .toBuffer();
}

async function prepareJpeg(original, meta) {
  const qualities = [config.imageUpload.jpegQuality, 92, 88, 84, 80]
    .filter((quality, index, values) => quality <= config.imageUpload.jpegQuality && values.indexOf(quality) === index);

  for (const quality of qualities) {
    const buffer = await sharp(original)
      .rotate()
      .flatten({ background: '#ffffff' })
      .jpeg({ quality, chromaSubsampling: '4:4:4', mozjpeg: true })
      .toBuffer();
    const outputMeta = await sharp(buffer).metadata();
    if (outputMeta.width !== meta.width || outputMeta.height !== meta.height) {
      throw new Error(`JPEG encoding changed resolution from ${meta.width}x${meta.height} to ${outputMeta.width}x${outputMeta.height}`);
    }
    if (buffer.length <= config.imageUpload.maxBytes) {
      return {
        buffer,
        extension: 'jpg',
        format: 'jpeg',
        width: outputMeta.width,
        height: outputMeta.height,
        quality,
        transformed: true,
      };
    }
  }

  throw new Error(`JPEG image exceeds Feishu limit at quality 80: ${meta.width}x${meta.height}`);
}

async function preparePng(original, meta, { colorReference = null } = {}) {
  let source = original;
  let sourceMeta = meta;
  let colorMatched = false;
  if (colorReference) {
    source = await matchPngColor(original, colorReference);
    sourceMeta = await sharp(source).metadata();
    colorMatched = true;
  }

  if (sourceMeta.format === 'png' && source.length <= config.imageUpload.maxBytes) {
    return {
      buffer: source,
      extension: 'png',
      format: 'png',
      width: sourceMeta.width,
      height: sourceMeta.height,
      quality: null,
      transformed: colorMatched,
      colorMatched,
    };
  }

  const scales = [1, 0.9, 0.8, 0.7, 0.6, 0.5];
  for (const scale of scales) {
    let image = sharp(source).rotate();
    if (scale < 1) {
      image = image.resize({
        width: Math.max(1, Math.floor(sourceMeta.width * scale)),
        height: Math.max(1, Math.floor(sourceMeta.height * scale)),
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    const buffer = await image.png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      palette: false,
    }).toBuffer();
    const outputMeta = await sharp(buffer).metadata();
    if (buffer.length <= config.imageUpload.maxBytes) {
      return {
        buffer,
        extension: 'png',
        format: 'png',
        width: outputMeta.width,
        height: outputMeta.height,
        quality: null,
        transformed: true,
        colorMatched,
      };
    }
  }

  throw new Error(`PNG image exceeds Feishu limit after resizing to 50%: ${meta.width}x${meta.height}`);
}

export async function prepareImageForUpload(url, {
  format = config.imageUpload.format,
  colorReferenceUrl = null,
  requireTransparent = false,
} = {}) {
  if (requireTransparent && format !== 'png') {
    throw new Error('无背景模式只能使用 PNG 输出');
  }
  const original = await readImageBuffer(url);
  if (requireTransparent) await assertTransparentPng(original);
  const meta = await sharp(original).metadata();
  if (!meta.width || !meta.height) throw new Error('image has no dimensions');
  if (format === 'jpeg' || format === 'jpg') return prepareJpeg(original, meta);
  if (format === 'png') {
    const colorReference = colorReferenceUrl ? await readImageBuffer(colorReferenceUrl) : null;
    const prepared = await preparePng(original, meta, { colorReference });
    if (requireTransparent) await assertTransparentPng(prepared.buffer);
    return prepared;
  }
  throw new Error(`Unsupported FEISHU_IMAGE_FORMAT: ${format}`);
}
