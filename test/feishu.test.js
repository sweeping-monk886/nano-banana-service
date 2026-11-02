import assert from 'node:assert/strict';
import test from 'node:test';

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

const { searchRecordsUrl } = await import('../src/feishu.js');

test('puts Feishu pagination token in the query string', () => {
  const url = new URL(searchRecordsUrl({
    appToken: 'app-token',
    tableId: 'table-id',
    pageSize: 50,
    pageToken: 'next/page token',
  }));

  assert.equal(url.searchParams.get('page_size'), '50');
  assert.equal(url.searchParams.get('page_token'), 'next/page token');
});
