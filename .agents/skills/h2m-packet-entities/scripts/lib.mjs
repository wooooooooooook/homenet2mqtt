export const BASE = (process.env.H2M_URL || 'http://127.0.0.1:3001/api/v1/agent').replace(
  /\/+$/,
  '',
);
const TOKEN = process.env.H2M_TOKEN || '';

// req()와 같은 인증/기본 URL을 쓰지만, 상태 코드와 본문을 그대로 돌려줘 호출부가 오류를 해석하게 한다.
export async function fetchJson(method, path, { body } = {}) {
  if (!TOKEN) die('H2M_TOKEN 환경변수가 필요합니다 (설정 > Agent API에서 발급한 토큰)');
  const url = /^https?:/.test(path) ? path : `${BASE}${path}`;
  const headers = { Authorization: `Bearer ${TOKEN}` };
  if (body) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (err) {
    return { ok: false, status: 0, text: '', json: null, url, error: err };
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* plain text */
  }
  return { ok: res.ok, status: res.status, text, json, url };
}

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(2);
}

export async function req(method, path, { body, raw } = {}) {
  if (!TOKEN) die('H2M_TOKEN 환경변수가 필요합니다 (설정 > Agent API에서 발급한 토큰)');
  const url = /^https?:/.test(path) ? path : `${BASE}${path}`;
  const headers = { Authorization: `Bearer ${TOKEN}` };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (raw) {
    if (!res.ok) die(`HTTP ${res.status} ${method} ${path}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* plain text */
  }
  if (!res.ok) die(`HTTP ${res.status} ${method} ${path} -> ${text.slice(0, 500)}`);
  return json ?? text;
}

export function printJson(value, max = 4000) {
  const s = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  console.log(s.length > max ? `${s.slice(0, max)}\n... <truncated ${s.length - max} chars>` : s);
}

export function usage(text) {
  console.error(`Usage: ${text}`);
  process.exit(2);
}
