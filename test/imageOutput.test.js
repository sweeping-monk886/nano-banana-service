import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';

process.env.FEISHU_APP_ID ||= 'test';
process.env.FEISHU_APP_SECRET ||= 'test';
process.env.FEISHU_MAIN_APP_TOKEN ||= 'test';
process.env.FEISHU_MAIN_TABLE_ID ||= 'test';
process.env.FEISHU_LIB_APP_TOKEN ||= 'test';
process.env.FEISHU_LIB_TABLE_ID ||= 'test';
process.env.NANO_BASE_URL ||= 'https://example.invalid';
process.env.NANO_API_KEY ||= 'test';
process.env.OPENAI_BASE_URL ||= 'https://example.invalid/v1';
process.env.OPENAI_API_KEY ||= 'test';
process.env.FEISHU_IMAGE_MAX_MB = '1';
process.env.FEISHU_IMAGE_FORMAT = 'png';

const { prepareImageForUpload } = await import('../src/imageOutput.js');

function asDataUrl(buffer, mime) {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

test('uploads an in-limit PNG without re-encoding it', async () => {
  const png = await sharp({
    create: { width: 320, height: 480, channels: 3, background: '#808080' },
  }).png().toBuffer();
  const output = await prepareImageForUpload(asDataUrl(png, 'image/png'));
  assert.equal(output.transformed, false);
  assert.equal(output.extension, 'png');
  assert.equal(output.format, 'png');
  assert.equal(output.width, 320);
  assert.equal(output.height, 480);
  assert.deepEqual(output.buffer, png);
});

test('keeps the JPEG strategy available as a rollback mode', async () => {
  const jpeg = await sharp({
    create: { width: 320, height: 480, channels: 3, background: '#808080' },
  }).jpeg().toBuffer();
  const output = await prepareImageForUpload(asDataUrl(jpeg, 'image/jpeg'), { format: 'jpeg' });
  assert.equal(output.transformed, true);
  assert.equal(output.extension, 'jpg');
  assert.equal(output.format, 'jpeg');
  assert.equal(output.width, 320);
  assert.equal(output.height, 480);
});

test('resizes an oversized PNG without using a palette', async () => {
  const width = 900;
  const height = 900;
  const png = await sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } }).png().toBuffer();
  assert.ok(png.length > 1024 * 1024);
  const output = await prepareImageForUpload(asDataUrl(png, 'image/png'));
  assert.ok(output.buffer.length <= 1024 * 1024);
  assert.equal(output.format, 'png');
  assert.ok(output.width < width);
  assert.ok(output.height < height);
  const meta = await sharp(output.buffer).metadata();
  assert.notEqual(meta.isPalette, true);
});

test('matches continuation PNG tone to the first image without palette conversion', async () => {
  const source = await sharp({
    create: { width: 320, height: 480, channels: 3, background: '#252040' },
  }).png().toBuffer();
  const reference = await sharp({
    create: { width: 320, height: 480, channels: 3, background: '#504a70' },
  }).png().toBuffer();
  const output = await prepareImageForUpload(asDataUrl(source, 'image/png'), {
    colorReferenceUrl: asDataUrl(reference, 'image/png'),
  });
  assert.equal(output.colorMatched, true);
  assert.equal(output.format, 'png');
  assert.equal(output.width, 320);
  assert.equal(output.height, 480);
  const meta = await sharp(output.buffer).metadata();
  assert.notEqual(meta.isPalette, true);
  assert.notDeepEqual(output.buffer, source);
});

test('rejects opaque PNGs and JPEG output for transparent mode', async () => {
  const opaque = await sharp({
    create: { width: 32, height: 32, channels: 3, background: '#ffffff' },
  }).png().toBuffer();
  await assert.rejects(
    prepareImageForUpload(`data:image/png;base64,${opaque.toString('base64')}`, { requireTransparent: true }),
    /透明 Alpha 通道/,
  );
  await assert.rejects(
    prepareImageForUpload(`data:image/png;base64,${opaque.toString('base64')}`, { format: 'jpeg', requireTransparent: true }),
    /只能使用 PNG/,
  );
});
