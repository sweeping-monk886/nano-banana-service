import sharp from 'sharp';
import pLimit from 'p-limit';
import { config } from './config.js';
import { logger } from './logger.js';
import { searchRecords, batchGetTmpDownloadUrls, uploadImageBuffer, updateRecord } from './feishu.js';
import { buildPrompts, collectFileTokens, fieldText } from './prompts.js';
import { nanoBanana } from './nano.js';
import { writeCaption } from './caption.js';
import { notifyWeChat } from './notify.js';
import { prepareImageForUpload, readImageBuffer } from './imageOutput.js';

const PENDING_FILTER = {
  conjunction: 'and',
  conditions: [{ field_name: '状态', operator: 'is', value: ['待处理'] }],
};

// Solid-background rows may be newly added and remain "待处理" in the
// library. Include those configured rows while keeping the normal library
// restricted to curated/processed entries.
const LIB_FILTER = {
  conjunction: 'or',
  conditions: [
    { field_name: '处理进度', operator: 'is', value: ['已处理'] },
    { field_name: '标号', operator: 'is', value: [config.prompts.whiteBackgroundNumber] },
    { field_name: '标号', operator: 'is', value: [config.prompts.beigeBackgroundNumber] },
  ],
};

function todayStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function modelReferenceLabels(count) {
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) return 'PRIMARY FRONT FACE — authoritative identity anchor. Copy this exact person; this image overrides every other face.';
    return `PERSON IDENTITY SUPPORTING VIEW ${index + 1} — the same person at another angle. Use only to clarify the primary identity; never average faces.`;
  });
}

function clothingReferenceLabels(count) {
  return Array.from({ length: count }, (_, index) => (
    `CLOTHING REFERENCE ${index + 1} — use the complete outfit and every visible garment, footwear and accessory; never use identity, face, hair, expression, pose or body shape.`
  ));
}

function backgroundReferenceLabels(count) {
  return Array.from({ length: count }, (_, index) => (
    `BACKGROUND REFERENCE ${index + 1} — use only scene layout, materials, lighting, color palette and atmosphere; never copy people, faces, clothing, bags, logos or text.`
  ));
}

export function selectReferenceTokens({ modelTokens, clothingTokens }) {
  return {
    modelTokens: modelTokens.slice(0, 2),
    clothingTokens: clothingTokens.slice(0, 1),
  };
}

export function buildContinuationReferenceSet({ modelUrls, modelLabels, clothingUrls = [], clothingLabels = [], backgroundUrls = [], backgroundLabels = [], previousUrl }) {
  return {
    urls: [...modelUrls, ...clothingUrls, ...backgroundUrls, previousUrl],
    labels: [
      ...modelLabels,
      ...clothingLabels,
      ...backgroundLabels,
      'PREVIOUSLY GENERATED FASHION IMAGE — use for outfit, body-scale, camera, lighting and color-grade continuity. Preserve its exact clothing pattern, logo, fabric, silhouette, exposure and colors; never copy its face.',
    ],
  };
}

export function buildInitialReferenceSet({ modelUrls, modelLabels, clothingUrls, clothingLabels, backgroundUrls = [], backgroundLabels = [] }) {
  return {
    urls: [...modelUrls, ...clothingUrls, ...backgroundUrls],
    labels: [
      ...modelLabels,
      ...clothingLabels,
      ...backgroundLabels,
    ],
  };
}

async function processRecord(record, promptLib, runStamp) {
  const recordId = record.record_id;
  const log = logger.child({ recordId });
  log.info('processing record');

  const collected = collectFileTokens(record);
  const { modelTokens, clothingTokens } = selectReferenceTokens(collected);
  const backgroundMode = fieldText(record.fields?.['背景模式']) || '自动场景';
  const backgroundNumber = fieldText(record.fields?.['背景编号'] ?? record.fields?.['场景编号']);
  const solidColor = fieldText(record.fields?.['纯色底颜色']) || '白色';
  const customBackgroundDescription = fieldText(record.fields?.['指定背景描述']);
  const backgroundTokens = backgroundMode === '指定背景' ? collected.backgroundTokens.slice(0, 1) : [];
  log.info({
    modelReferencesUsed: modelTokens.length,
    modelReferencesIgnored: collected.modelTokens.length - modelTokens.length,
    clothingReferencesUsed: clothingTokens.length,
    clothingReferencesIgnored: collected.clothingTokens.length - clothingTokens.length,
    backgroundMode,
    backgroundNumber,
    solidColor,
    backgroundReferencesUsed: backgroundTokens.length,
  }, 'selected reference images');
  const { background, poses, prompt1, prompt2, prompt3, transparentBackground } = buildPrompts({
    promptLib,
    modelReferenceCount: modelTokens.length,
    clothingReferenceCount: clothingTokens.length,
    backgroundReferenceCount: backgroundTokens.length,
    backgroundMode,
    backgroundNumber,
    solidColor,
    customBackgroundDescription,
    whiteBackgroundNumber: config.prompts.whiteBackgroundNumber,
    beigeBackgroundNumber: config.prompts.beigeBackgroundNumber,
  });
  log.info({ background, poses }, 'selected scene prompts');

  const allTokens = [...modelTokens, ...clothingTokens, ...backgroundTokens];
  const tmpUrls = await batchGetTmpDownloadUrls(allTokens, {
    bitablePerm: { tableId: config.feishu.mainTableId, rev: 5 },
  });
  if (tmpUrls.length === 0) throw new Error('未获取到临时下载链接');

  const modelUrls = tmpUrls.slice(0, modelTokens.length);
  const clothingUrls = tmpUrls.slice(modelTokens.length, modelTokens.length + clothingTokens.length);
  const backgroundUrls = tmpUrls.slice(modelTokens.length + clothingTokens.length);
  const modelLabels = modelReferenceLabels(modelUrls.length);
  const clothingLabels = clothingReferenceLabels(clothingUrls.length);
  const backgroundLabels = backgroundReferenceLabels(backgroundUrls.length);
  const initialReferences = buildInitialReferenceSet({
    modelUrls,
    modelLabels,
    clothingUrls,
    clothingLabels,
    backgroundUrls,
    backgroundLabels,
  });
  const gen1Urls = initialReferences.urls;
  const gen1Labels = initialReferences.labels;

  log.info('calling nano-banana #1');
  const gen1 = await nanoBanana({ prompt: prompt1, urls: gen1Urls, referenceLabels: gen1Labels });
  const gen1FinalUrl = gen1.url;
  log.info({ resultType: gen1FinalUrl.startsWith('data:') ? 'inline-data' : 'url' }, 'gen1 ready');

  const continuationReferences = buildContinuationReferenceSet({
    modelUrls,
    modelLabels,
    clothingUrls,
    clothingLabels,
    backgroundUrls,
    backgroundLabels,
    previousUrl: gen1FinalUrl,
  });
  const gen2Urls = continuationReferences.urls;
  const gen3Urls = continuationReferences.urls;
  const gen2Labels = continuationReferences.labels;
  const gen3Labels = continuationReferences.labels;

  const runBranch = async (name, fn) => {
    try {
      return await fn();
    } catch (error) {
      log.error({
        branch: name,
        status: error.response?.status,
        response: typeof error.response?.data === 'string'
          ? error.response.data.slice(0, 500)
          : error.response?.data,
        err: error.message,
      }, 'branch failed');
      throw error;
    }
  };

  const uploadResult = async ({ url, index, fieldName, colorReferenceUrl = null }) => {
    const prepared = await prepareImageForUpload(url, {
      colorReferenceUrl,
      requireTransparent: transparentBackground,
    });
    log.info({
      image: index,
      resolution: `${prepared.width}x${prepared.height}`,
      format: prepared.format,
      bytes: prepared.buffer.length,
      transformed: prepared.transformed,
      quality: prepared.quality,
      colorMatched: prepared.colorMatched || false,
    }, 'image prepared for Feishu');
    const fileToken = await uploadImageBuffer({
      parentNode: config.feishu.mainAppToken,
      buffer: prepared.buffer,
      fileName: `${runStamp}_${index}.${prepared.extension}`,
    });
    await updateRecord({
      appToken: config.feishu.mainAppToken,
      tableId: config.feishu.mainTableId,
      recordId,
      fields: { [fieldName]: [{ file_token: fileToken }] },
    });
  };

  // 4 parallel branches matching n8n
  const branchResults = await Promise.allSettled([
    // A: caption (download gen1 -> resize -> gpt -> 文案)
    runBranch('caption', async () => {
      const raw = await readImageBuffer(gen1FinalUrl);
      const resized = await sharp(raw).resize(1440, 2560).jpeg().toBuffer();
      const caption = await writeCaption(resized);
      await updateRecord({
        appToken: config.feishu.mainAppToken,
        tableId: config.feishu.mainTableId,
        recordId,
        fields: { 文案: caption },
      });
      log.info('caption written');
    }),

    // B: upload gen1 -> 生成图片
    runBranch('upload-1', async () => {
      await uploadResult({ url: gen1FinalUrl, index: 1, fieldName: '生成图片' });
      log.info('gen1 uploaded -> 生成图片');
    }),

    // C: gen2 -> upload -> 生成图片2
    runBranch('generate-2', async () => {
      log.info('calling nano-banana #2');
      const gen2 = await nanoBanana({ prompt: prompt2, urls: gen2Urls, referenceLabels: gen2Labels });
      const gen2FinalUrl = gen2.url;
      await uploadResult({ url: gen2FinalUrl, index: 2, fieldName: '生成图片2', colorReferenceUrl: gen1FinalUrl });
      log.info('gen2 uploaded -> 生成图片2');
    }),

    // D: gen3 -> upload -> 生成图片3
    runBranch('generate-3', async () => {
      log.info('calling nano-banana #3');
      const gen3 = await nanoBanana({ prompt: prompt3, urls: gen3Urls, referenceLabels: gen3Labels });
      const gen3FinalUrl = gen3.url;
      await uploadResult({ url: gen3FinalUrl, index: 3, fieldName: '生成图片3', colorReferenceUrl: gen1FinalUrl });
      log.info('gen3 uploaded -> 生成图片3');
    }),
  ]);

  const branchErrors = branchResults
    .filter(result => result.status === 'rejected')
    .map(result => result.reason);
  if (branchErrors.length > 0) {
    throw new AggregateError(branchErrors, `${branchErrors.length} record branch(es) failed`);
  }

  await updateRecord({
    appToken: config.feishu.mainAppToken,
    tableId: config.feishu.mainTableId,
    recordId,
    fields: { 状态: '已完成' },
  });
  log.info('record done -> 状态=已完成');
}

export async function runOnce() {
  const runStamp = todayStamp();
  logger.info({ runStamp }, 'run start');

  const [pending, promptLib] = await Promise.all([
    searchRecords({
      appToken: config.feishu.mainAppToken,
      tableId: config.feishu.mainTableId,
      filter: PENDING_FILTER,
    }),
    searchRecords({
      appToken: config.feishu.libAppToken,
      tableId: config.feishu.libTableId,
      filter: LIB_FILTER,
    }),
  ]);

  logger.info({ pending: pending.length, promptLib: promptLib.length }, 'fetched');
  if (pending.length === 0) return { processed: 0 };

  const limit = config.service.maxRecordsPerRun > 0
    ? pending.slice(0, config.service.maxRecordsPerRun)
    : pending;

  const gate = pLimit(config.service.recordConcurrency);
  let ok = 0, fail = 0;
  await Promise.all(limit.map(rec => gate(async () => {
    try {
      await processRecord(rec, promptLib, runStamp);
      ok++;
    } catch (e) {
      fail++;
      logger.error({ recordId: rec.record_id, err: e.message }, 'record failed');
      try {
        await updateRecord({
          appToken: config.feishu.mainAppToken,
          tableId: config.feishu.mainTableId,
          recordId: rec.record_id,
          fields: { 状态: '失败' },
        });
      } catch (statusError) {
        logger.error({ recordId: rec.record_id, err: statusError.message }, 'failed to mark record as failed');
      }
    }
  })));

  if (ok > 0 && fail === 0) {
    await notifyWeChat();
  } else if (fail > 0) {
    logger.warn({ ok, fail }, 'completion notification skipped because records failed');
  }
  logger.info({ ok, fail }, 'run done');
  return { processed: ok, failed: fail, total: limit.length };
}
