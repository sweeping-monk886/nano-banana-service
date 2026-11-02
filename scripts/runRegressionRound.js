import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { nanoBanana } from '../src/nano.js';
import { prepareImageForUpload, readImageBuffer } from '../src/imageOutput.js';
import { buildPrompts } from '../src/prompts.js';

const workspace = path.resolve(import.meta.dirname, '..');
const defaultInputDir = 'C:\\Users\\24248\\AppData\\Local\\Temp\\nano-banana-review-20260810-run5';
const inputDir = process.env.REGRESSION_INPUT_DIR || defaultInputDir;
const round = String(process.argv[2] || process.env.REGRESSION_ROUND || '1').padStart(2, '0');
const outputDir = path.join(workspace, 'regression-results', '20260810', `round-${round}`);

const inputPaths = {
  frontFace: process.env.REGRESSION_FRONT_FACE || path.join(inputDir, 'recvrSG0ZWxt23-model-1.JPG'),
  angleFace: process.env.REGRESSION_ANGLE_FACE || path.join(inputDir, 'recvrSG0ZWxt23-model-2.jpg'),
  clothing: process.env.REGRESSION_CLOTHING || path.join(inputDir, 'recvrSG0ZWxt23-clothing-1.jpg'),
};

const fixedPromptSet = {
  background: 'Outside a modern glass-fronted fashion store in soft natural daylight, clean neutral pavement, realistic editorial photography, no signs or props near the model.',
  poses: [
    'Full-body standing pose facing the camera, shoulders level, arms relaxed naturally at both sides, head upright and nearly frontal.',
    'Full-body standing pose with a very slight body turn, shoulders relaxed, arms down, head upright and face kept nearly frontal.',
    'Full-body walking pose with one small natural step, arms relaxed, head upright and face kept nearly frontal.',
  ],
};

const labels = [
  'PRIMARY FRONT FACE - authoritative identity anchor. Copy this exact person; this image overrides every other face.',
  'PERSON IDENTITY SUPPORTING VIEW 2 - the same person at another angle. Use only to clarify the primary identity; never average faces.',
  'CLOTHING REFERENCE 1 - use only garments and footwear, never identity, face, hair, expression, pose, body shape, jewelry, eyewear or bags.',
];

function hash(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function asDataUrl(filePath) {
  const buffer = await readFile(filePath);
  const meta = await sharp(buffer).metadata();
  const mime = meta.format === 'png' ? 'image/png' : 'image/jpeg';
  return { url: `data:${mime};base64,${buffer.toString('base64')}`, buffer, meta };
}

async function saveGenerated(name, url) {
  const raw = await readImageBuffer(url);
  const rawMeta = await sharp(raw).metadata();
  const prepared = await prepareImageForUpload(`data:${rawMeta.format === 'png' ? 'image/png' : 'image/jpeg'};base64,${raw.toString('base64')}`);
  const filePath = path.join(outputDir, `${name}.${prepared.extension}`);
  await writeFile(filePath, prepared.buffer);
  return {
    file: path.relative(workspace, filePath),
    rawBytes: raw.length,
    uploadBytes: prepared.buffer.length,
    rawFormat: rawMeta.format,
    uploadFormat: prepared.format,
    resolution: `${prepared.width}x${prepared.height}`,
    transformed: prepared.transformed,
    palette: (await sharp(prepared.buffer).metadata()).isPalette === true,
    sha256: hash(prepared.buffer),
  };
}

await mkdir(outputDir, { recursive: true });
const promptSourcePath = path.join(workspace, 'src', 'prompts.js');
const promptSource = await readFile(promptSourcePath);
await writeFile(path.join(outputDir, 'prompts.js.txt'), promptSource);

const inputs = {};
const referenceUrls = [];
for (const [name, filePath] of Object.entries(inputPaths)) {
  const input = await asDataUrl(filePath);
  inputs[name] = {
    file: filePath,
    bytes: input.buffer.length,
    resolution: `${input.meta.width}x${input.meta.height}`,
    sha256: hash(input.buffer),
  };
  referenceUrls.push(input.url);
}

const prompts = buildPrompts({
  promptLib: [],
  modelReferenceCount: 2,
  clothingReferenceCount: 1,
  fixedPromptSet,
});
const manifest = {
  round: Number(round),
  startedAt: new Date().toISOString(),
  promptSourceSha256: hash(promptSource),
  changeNote: process.env.REGRESSION_CHANGE_NOTE || '',
  issueNote: process.env.REGRESSION_ISSUE_NOTE || '',
  inputs,
  fixedPromptSet,
  prompts,
  outputs: {},
  error: null,
};
const manifestPath = path.join(outputDir, 'manifest.json');
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

try {
  process.stdout.write(`round ${round}: generating image 1\n`);
  const gen1 = await nanoBanana({ prompt: prompts.prompt1, urls: referenceUrls, referenceLabels: labels });
  manifest.outputs.image1 = await saveGenerated('image-1', gen1.url);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const continuationUrls = [...referenceUrls, gen1.url];
  const continuationLabels = [
    ...labels,
    'PREVIOUSLY GENERATED FASHION IMAGE - use only for outfit and composition continuity. Preserve its exact clothing pattern, logo, fabric, silhouette and colors; never copy its face.',
  ];
  process.stdout.write(`round ${round}: generating images 2 and 3\n`);
  const [gen2, gen3] = await Promise.all([
    nanoBanana({ prompt: prompts.prompt2, urls: continuationUrls, referenceLabels: continuationLabels }),
    nanoBanana({ prompt: prompts.prompt3, urls: continuationUrls, referenceLabels: continuationLabels }),
  ]);
  manifest.outputs.image2 = await saveGenerated('image-2', gen2.url);
  manifest.outputs.image3 = await saveGenerated('image-3', gen3.url);
} catch (error) {
  manifest.error = {
    message: error.message,
    status: error.response?.status || null,
    response: typeof error.response?.data === 'string'
      ? error.response.data.slice(0, 1000)
      : error.response?.data || null,
  };
  throw error;
} finally {
  manifest.finishedAt = new Date().toISOString();
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

process.stdout.write(`round ${round}: complete -> ${outputDir}\n`);
