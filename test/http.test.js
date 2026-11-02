import assert from 'node:assert/strict';
import test from 'node:test';

process.env.FEISHU_APP_ID ||= 'test';
process.env.FEISHU_APP_SECRET ||= 'test';
process.env.FEISHU_MAIN_APP_TOKEN ||= 'test';
process.env.FEISHU_MAIN_TABLE_ID ||= 'test';
process.env.FEISHU_LIB_APP_TOKEN ||= 'test';
process.env.FEISHU_LIB_TABLE_ID ||= 'test';
process.env.NANO_BASE_URL ||= 'https://example.invalid/v1beta';
process.env.NANO_API_KEY ||= 'test';
process.env.OPENAI_BASE_URL ||= 'https://example.invalid/v1';
process.env.OPENAI_API_KEY ||= 'test';

const { createApp } = await import('../src/index.js');

async function withServer(fn) {
  const app = createApp(async () => ({ processed: 0, failed: 0, total: 0 }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const { port } = server.address();
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('health endpoint identifies the service', async () => {
  await withServer(async baseUrl => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, service: 'nano-banana-service' });
  });
});

test('legacy Feishu button can call POST /nano without a token header', async () => {
  await withServer(async baseUrl => {
    const response = await fetch(`${baseUrl}/nano`, { method: 'POST' });
    assert.equal(response.status, 202);
    assert.ok(['started', 'already_running'].includes((await response.json()).status));
  });
});
