import assert from 'node:assert/strict';
import test from 'node:test';

process.env.FEISHU_APP_ID ||= 'test';
process.env.FEISHU_APP_SECRET ||= 'test';
process.env.FEISHU_MAIN_APP_TOKEN ||= 'test';
process.env.FEISHU_MAIN_TABLE_ID ||= 'test';
process.env.FEISHU_LIB_APP_TOKEN ||= 'test';
process.env.FEISHU_LIB_TABLE_ID ||= 'test';
process.env.NANO_BASE_URL ||= 'https://nano.example/v1beta';
process.env.NANO_API_KEY ||= 'nano-key';
process.env.OPENAI_BASE_URL ||= 'https://primary.example/v1';
process.env.OPENAI_API_KEY ||= 'primary-key';
process.env.CAPTION_FALLBACK_BASE_URL ||= 'https://fallback.example/v1';
process.env.CAPTION_FALLBACK_API_KEY ||= 'fallback-key';

const { writeCaption } = await import('../src/caption.js');

function providerError(status, message) {
  return Object.assign(new Error(message), {
    response: { status, data: { error: { message } } },
  });
}

test('uses the fallback provider when the primary caption request fails', async () => {
  const calls = [];
  const post = async (url, body, options) => {
    calls.push({ url, body, options });
    if (calls.length === 1) throw providerError(503, 'primary unavailable');
    return { data: { choices: [{ message: { content: '  fallback caption  ' } }] } };
  };

  const result = await writeCaption(Buffer.from('image'), { post });

  assert.equal(result, 'fallback caption');
  assert.equal(calls[0].url, 'https://primary.example/v1/chat/completions');
  assert.equal(calls[1].url, 'https://fallback.example/v1/chat/completions');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer fallback-key');
});

test('reports both provider failures', async () => {
  let call = 0;
  const post = async () => {
    call += 1;
    throw providerError(call === 1 ? 504 : 401, call === 1 ? 'primary timeout' : 'fallback exhausted');
  };

  await assert.rejects(
    writeCaption(Buffer.from('image'), { post }),
    error => error instanceof AggregateError
      && /primary.*HTTP 504: primary timeout/.test(error.message)
      && /fallback.*HTTP 401: fallback exhausted/.test(error.message),
  );
});

test('rejects an image payload returned as caption text', async () => {
  const post = async () => ({
    data: { choices: [{ message: { content: '![image](data:image/png;base64,AAAA)' } }] },
  });

  await assert.rejects(
    writeCaption(Buffer.from('image'), { post }),
    /contained image data instead of text/,
  );
});
