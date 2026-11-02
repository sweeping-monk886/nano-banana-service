import axios from 'axios';
import { config } from './config.js';
import { logger } from './logger.js';

const OPEN = 'https://open.feishu.cn/open-apis';

let cachedToken = null;
let cachedExpireAt = 0;

export async function getTenantToken() {
  const now = Date.now();
  if (cachedToken && now < cachedExpireAt - 60_000) return cachedToken;
  const { data } = await axios.post(`${OPEN}/auth/v3/tenant_access_token/internal`, {
    app_id: config.feishu.appId,
    app_secret: config.feishu.appSecret,
  });
  if (data.code !== 0) throw new Error(`tenant_access_token failed: ${JSON.stringify(data)}`);
  cachedToken = data.tenant_access_token;
  cachedExpireAt = now + data.expire * 1000;
  logger.debug({ expireIn: data.expire }, 'feishu token refreshed');
  return cachedToken;
}

async function authHeaders() {
  return { Authorization: `Bearer ${await getTenantToken()}` };
}

export function searchRecordsUrl({ appToken, tableId, pageSize, pageToken = '' }) {
  const query = new URLSearchParams({ page_size: String(pageSize) });
  if (pageToken) query.set('page_token', pageToken);
  return `${OPEN}/bitable/v1/apps/${appToken}/tables/${tableId}/records/search?${query}`;
}

export async function searchRecords({ appToken, tableId, filter, pageSize = 50 }) {
  const all = [];
  let pageToken = '';
  do {
    const url = searchRecordsUrl({ appToken, tableId, pageSize, pageToken });
    const body = { filter };
    const { data } = await axios.post(url, body, { headers: await authHeaders() });
    if (data.code !== 0) throw new Error(`searchRecords failed: ${JSON.stringify(data)}`);
    all.push(...(data.data?.items || []));
    pageToken = data.data?.has_more ? data.data.page_token : '';
  } while (pageToken);
  return all;
}

export async function batchGetTmpDownloadUrls(fileTokens, extra) {
  const q = fileTokens.map(t => `file_tokens=${encodeURIComponent(t)}`).join('&');
  const extraQ = extra ? `&extra=${encodeURIComponent(JSON.stringify(extra))}` : '';
  const url = `${OPEN}/drive/v1/medias/batch_get_tmp_download_url?${q}${extraQ}`;
  const { data } = await axios.get(url, { headers: await authHeaders() });
  if (data.code !== 0) throw new Error(`batch_get_tmp_download_url failed: ${JSON.stringify(data)}`);
  const items = data.data?.tmp_download_urls || [];
  const urlByToken = new Map(
    items
      .filter(item => item.file_token && item.tmp_download_url)
      .map(item => [item.file_token, item.tmp_download_url]),
  );
  const missingTokens = fileTokens.filter(token => !urlByToken.has(token));
  if (missingTokens.length > 0) {
    throw new Error(`batch_get_tmp_download_url missing tokens: ${missingTokens.join(',')}`);
  }
  return fileTokens.map(token => urlByToken.get(token));
}

export async function uploadImageByUrl({ parentNode, url, fileName }) {
  let buf;
  const dataMatch = String(url || '').match(/^data:([^;]+);base64,(.+)$/s);
  if (dataMatch) {
    buf = Buffer.from(dataMatch[2], 'base64');
  } else {
    const dl = await axios.get(url, { responseType: 'arraybuffer', timeout: 600_000 });
    buf = Buffer.from(dl.data);
  }
  return uploadImageBuffer({ parentNode, buffer: buf, fileName });
}

export async function uploadImageBuffer({ parentNode, buffer, fileName }) {
  const form = new FormData();
  const blob = new Blob([buffer]);
  form.append('file_name', fileName);
  form.append('parent_type', 'bitable_image');
  form.append('parent_node', parentNode);
  form.append('size', String(buffer.length));
  form.append('file', blob, fileName);
  const { data } = await axios.post(
    `${OPEN}/drive/v1/medias/upload_all`,
    form,
    { headers: await authHeaders(), maxBodyLength: Infinity, maxContentLength: Infinity, timeout: 600_000 },
  );
  if (data.code !== 0) throw new Error(`upload_all failed: ${JSON.stringify(data)}`);
  return data.data?.file_token;
}

export async function updateRecord({ appToken, tableId, recordId, fields }) {
  const url = `${OPEN}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
  const { data } = await axios.put(url, { fields }, { headers: await authHeaders() });
  if (data.code !== 0) throw new Error(`updateRecord failed: ${JSON.stringify(data)}`);
  return data.data?.record;
}
