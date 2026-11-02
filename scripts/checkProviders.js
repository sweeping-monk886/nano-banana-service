import 'dotenv/config';
import axios from 'axios';

function providerError(error) {
  const status = error.response?.status;
  const message = error.response?.data?.error?.message
    || error.response?.data?.msg
    || error.message;
  return `${status ? `HTTP ${status}: ` : ''}${message}`;
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
    return true;
  } catch (error) {
    console.error(`FAIL ${name}: ${providerError(error)}`);
    return false;
  }
}

const feishu = await check('Feishu', async () => {
  const auth = await axios.post(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    { app_id: process.env.FEISHU_APP_ID, app_secret: process.env.FEISHU_APP_SECRET },
    { timeout: 15_000 },
  );
  if (auth.data.code !== 0) throw new Error(auth.data.msg || `Feishu code ${auth.data.code}`);
  const headers = { Authorization: `Bearer ${auth.data.tenant_access_token}` };
  const tables = [
    [
      process.env.FEISHU_MAIN_APP_TOKEN,
      process.env.FEISHU_MAIN_TABLE_ID,
      ['状态', '模特参考图', '衣服参考图', '生成图片', '生成图片2', '生成图片3', '文案'],
    ],
    [
      process.env.FEISHU_LIB_APP_TOKEN,
      process.env.FEISHU_LIB_TABLE_ID,
      ['处理进度', '背景提示词2', '动作提示词'],
    ],
  ];
  for (const [appToken, tableId, expectedFields] of tables) {
    const { data } = await axios.get(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields?page_size=100`,
      { headers, timeout: 15_000 },
    );
    if (data.code !== 0) throw new Error(data.msg || `Feishu code ${data.code}`);
    const actualFields = (data.data?.items || []).map(field => field.field_name);
    const missingFields = expectedFields.filter(field => !actualFields.includes(field));
    if (missingFields.length > 0) throw new Error(`missing fields: ${missingFields.join(', ')}`);
  }
});

async function captionInference(baseUrl, apiKey, model) {
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
  const { data } = await axios.post(
    `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
    {
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Inspect the image and reply with OK only.' },
          { type: 'image_url', image_url: { url: pixel } },
        ],
      }],
      max_tokens: 8,
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 30_000,
    },
  );
  if (!data?.choices?.[0]?.message?.content) throw new Error('caption response was empty');
}

const fallbackBaseUrl = process.env.CAPTION_FALLBACK_BASE_URL
  || `${new URL(process.env.NANO_BASE_URL).origin}/v1`;
const fallbackApiKey = process.env.CAPTION_FALLBACK_API_KEY || process.env.NANO_API_KEY;
const caption = await check('Caption provider', async () => {
  try {
    await captionInference(
      process.env.OPENAI_BASE_URL,
      process.env.OPENAI_API_KEY,
      process.env.OPENAI_MODEL || 'gpt-5.4',
    );
  } catch (primaryError) {
    try {
      await captionInference(
        fallbackBaseUrl,
        fallbackApiKey,
        process.env.CAPTION_FALLBACK_MODEL || 'gemini-3.5-flash',
      );
    } catch (fallbackError) {
      throw new Error(`primary: ${providerError(primaryError)}; fallback: ${providerError(fallbackError)}`);
    }
  }
});

if (!feishu || !caption) process.exitCode = 1;
