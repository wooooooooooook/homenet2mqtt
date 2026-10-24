export const BASE = (process.env.H2M_URL || 'http://127.0.0.1:3001/api/v1/agent').replace(
  /\/+$/,
  '',
);
const TOKEN = process.env.H2M_TOKEN || '';

const TOKEN_MISSING =
  'H2M_TOKEN 환경변수가 필요합니다 (UI 설정 > Agent API에서 발급). 주소·활성화 방법은 references/connection-setup.md를 보세요.';
const NETWORK_FAILED =
  'H2M_URL에 연결하지 못했습니다. 주소·포트를 확인하세요. API 토글이 꺼져 있으면 포트가 열리지 않습니다 (references/connection-setup.md).';

const statusHint = (status, code) => {
  if (code === 'UNAUTHORIZED' || status === 401) {
    return '토큰이 유효하지 않습니다. H2M_TOKEN을 확인하거나 UI 설정 > Agent API에서 재발급하세요.';
  }
  if (code === 'AGENT_API_DISABLED') {
    return 'Agent API가 꺼져 있거나 토큰이 없습니다. UI 설정 > Agent API의 상태와 토큰을 확인하세요.';
  }
  if (status === 404) {
    return '경로가 없습니다. UI 포트(기본 3000)가 아니라 Agent API 포트(기본 3001)인지 확인하세요.';
  }
  return '';
};

// req()와 같은 인증/기본 URL을 쓰지만, 상태 코드와 본문을 그대로 돌려줘 호출부가 오류를 해석하게 한다.
export async function fetchJson(method, path, { body } = {}) {
  if (!TOKEN) die(TOKEN_MISSING);
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
  if (!TOKEN) die(TOKEN_MISSING);
  const url = /^https?:/.test(path) ? path : `${BASE}${path}`;
  const headers = { Authorization: `Bearer ${TOKEN}` };
  if (body) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (err) {
    const reason =
      err?.cause?.code ??
      err?.cause?.errors?.[0]?.code ??
      err?.cause?.message ??
      err?.message ??
      String(err);
    die(`${NETWORK_FAILED} (${reason})`);
  }
  if (raw) {
    if (!res.ok) {
      const hint = statusHint(res.status, null);
      die(`HTTP ${res.status} ${method} ${path}${hint ? `\n  ${hint}` : ''}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* plain text */
  }
  if (!res.ok) {
    const hint = statusHint(res.status, json?.error);
    die(
      `HTTP ${res.status} ${method} ${path} -> ${text.slice(0, 500)}${hint ? `\n  ${hint}` : ''}`,
    );
  }
  return json ?? text;
}

export function printJson(value, max = 4000) {
  const s = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  // max<=0 means unlimited: truncating structured output makes it invalid JSON.
  console.log(
    max > 0 && s.length > max ? `${s.slice(0, max)}\n... <truncated ${s.length - max} chars>` : s,
  );
}

export function usage(text) {
  console.error(`Usage: ${text}`);
  process.exit(2);
}
