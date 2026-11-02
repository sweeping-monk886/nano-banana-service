import axios from 'axios';
import { config } from './config.js';
import { logger } from './logger.js';

const SYSTEM_PROMPT = `你是一个高级女装品牌主理人 & 资深新媒体文案。

【角色定义】
你具有极高的时尚敏锐度和强大的图像视觉分析能力。你的审美偏向"极简、清冷、高智感、松弛感"。你的文字干净利落，不堆砌辞藻，擅长通过"场景化"和"穿搭逻辑"来传递服装的情绪价值，让读者产生"毫不费力的时髦（Effortless Chic）"的共鸣。

【任务】
我会上传一张或多张【服装穿搭图】。请先静默分析图片，提取单品、色彩、剪裁、场景，然后直接撰写文案。

【输出结构】
1. 场景化标题:
   - 用四字或五字场景词开头。不要直接提衣服，写出氛围感。后面加上合适的emoji
2. 穿搭逻辑:
   - 用2-4句话客观描述设计细节、色彩搭配或面料碰撞，点出"为什么要这么搭"。体现主理人"看着轻松，其实很会穿"的逻辑。
3. 情绪价值收尾:
   - 一句话总结穿上这套衣服的个人状态，精准击中28-32岁独立女性心理

【限制条件】
1. 字数严格控制在 60-80 字以内。
2. 拒绝使用"绝绝子"、"纯欲"、"斩男"、"好仙"等廉价网络热词。
3. 语气保持清冷、客观、自信。`;

function chatCompletionsUrl(baseUrl) {
  return `${String(baseUrl).replace(/\/+$/, '')}/chat/completions`;
}

function captionText(content) {
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map(part => part?.text || '').join('')
      : '';
  const trimmed = text.trim();
  if (!trimmed) throw new Error('caption response was empty');
  if (trimmed.length > 2_000 || /data:image\//i.test(trimmed)) {
    throw new Error('caption response contained image data instead of text');
  }
  return trimmed;
}

function errorDetails(error) {
  const status = error.response?.status;
  const providerMessage = error.response?.data?.error?.message
    || error.response?.data?.message
    || error.message;
  return `${status ? `HTTP ${status}: ` : ''}${providerMessage}`;
}

async function requestCaption({ baseUrl, apiKey, model, timeoutMs, imageBuffer, post }) {
  const dataUrl = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
  const { data } = await post(
    chatCompletionsUrl(baseUrl),
    {
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: '请根据这张穿搭图按格式撰写文案。只输出最终文案。' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: timeoutMs,
    },
  );
  return captionText(data?.choices?.[0]?.message?.content);
}

export async function writeCaption(imageBuffer, { post = axios.post.bind(axios) } = {}) {
  let primaryError;
  try {
    return await requestCaption({
      baseUrl: config.openai.baseUrl,
      apiKey: config.openai.apiKey,
      model: config.openai.model,
      timeoutMs: config.openai.timeoutMs,
      imageBuffer,
      post,
    });
  } catch (error) {
    primaryError = error;
    logger.warn({ err: errorDetails(error) }, 'primary caption provider failed; trying fallback');
  }

  try {
    return await requestCaption({
      baseUrl: config.openai.fallbackBaseUrl,
      apiKey: config.openai.fallbackApiKey,
      model: config.openai.fallbackModel,
      timeoutMs: config.openai.fallbackTimeoutMs,
      imageBuffer,
      post,
    });
  } catch (fallbackError) {
    throw new AggregateError(
      [primaryError, fallbackError],
      `caption generation failed; primary: ${errorDetails(primaryError)}; fallback: ${errorDetails(fallbackError)}`,
    );
  }
}
