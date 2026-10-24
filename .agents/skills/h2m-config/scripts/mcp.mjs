#!/usr/bin/env node
// H2M MCP 클라이언트 (Streamable HTTP, JSON-RPC 2.0, stateless).
// REST 래퍼 h2m.mjs와 같은 H2M_URL/H2M_TOKEN을 쓴다. MCP에 없는 기능은 h2m.mjs(REST)로 내려온다.
// Usage:
//   node mcp.mjs tools                          도구 목록 + 필수 인자
//   node mcp.mjs call <tool> [jsonArgs|@file] [--max N]  도구 호출 (인자 생략 시 {}, 기본 전체 출력)
//   node mcp.mjs raw <method> [jsonParams]       임의 JSON-RPC 메서드
//   node mcp.mjs init [protocolVersion]          initialize + notifications/initialized
// 예: node mcp.mjs call get_unmatched_packets '{"portId":"main"}'
//     node mcp.mjs call validate_entity_draft @draft.json
import fs from 'node:fs';
import { req, printJson, usage } from './lib.mjs';

const [cmd, ...a] = process.argv.slice(2);
const MCP_PATH = '/mcp';
const flag = (name, fallback) => {
  const i = a.indexOf(`--${name}`);
  return i >= 0 ? a[i + 1] : fallback;
};

let nextId = 0;
const rpc = async (method, params) => {
  const body = { jsonrpc: '2.0', id: ++nextId, method };
  if (params !== undefined) body.params = params;
  const res = await req('POST', MCP_PATH, { body });
  if (res?.error) {
    console.error(
      `JSON-RPC ${res.error.code}: ${res.error.message}${
        res.error.data ? ` ${JSON.stringify(res.error.data)}` : ''
      }`,
    );
    process.exit(1);
  }
  return res?.result;
};

const notify = async (method) => {
  await req('POST', MCP_PATH, { body: { jsonrpc: '2.0', method } });
};

const readObject = (text) => {
  if (!text) return {};
  let raw = text;
  if (text.startsWith('@')) {
    try {
      raw = fs.readFileSync(text.slice(1), 'utf8');
    } catch (error) {
      console.error(`ERROR: 인자 파일을 읽을 수 없습니다 (${text}): ${error.message}`);
      process.exit(2);
    }
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    console.error(`ERROR: JSON 인자가 아닙니다 (${error.message})`);
    process.exit(2);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    console.error('ERROR: JSON 인자는 객체여야 합니다.');
    process.exit(2);
  }
  return value;
};

const argHint = (schema) => {
  const props = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  const names = Object.keys(props).map((name) => (required.has(name) ? `${name}*` : name));
  return names.length ? names.join(' ') : '-';
};

switch (cmd) {
  case 'tools': {
    const result = await rpc('tools/list');
    const tools = result?.tools ?? [];
    for (const tool of tools) console.log(`${tool.name}\t${argHint(tool.inputSchema)}`);
    console.log(`# tools=${tools.length}`);
    break;
  }
  case 'call': {
    const positional = a.filter((arg, i) => !arg.startsWith('--') && !a[i - 1]?.startsWith('--'));
    if (!positional[0]) usage('mcp.mjs call <tool> [jsonArgs|@file.json] [--max N]');
    const max = Number(flag('max', 0));
    const outputMax = Number.isFinite(max) && max > 0 ? max : 0;
    const result = await rpc('tools/call', {
      name: positional[0],
      arguments: readObject(positional[1]),
    });
    const data = result?.structuredContent;
    if (result?.isError) {
      printJson(data ?? result?.content?.[0]?.text ?? result, outputMax);
      process.exit(1);
    }
    // Full output by default: get_config_schema is ~120KB and truncation corrupts the JSON.
    printJson(data ?? result?.content?.[0]?.text ?? result, outputMax);
    break;
  }
  case 'raw': {
    if (!a[0]) usage('mcp.mjs raw <method> [jsonParams]');
    printJson(await rpc(a[0], a[1] ? readObject(a[1]) : undefined), 8000);
    break;
  }
  case 'init': {
    const result = await rpc('initialize', {
      protocolVersion: a[0] || '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'h2m-skill', version: '1.0' },
    });
    await notify('notifications/initialized');
    printJson(
      {
        protocolVersion: result?.protocolVersion,
        serverInfo: result?.serverInfo,
        instructions: result?.instructions,
      },
      6000,
    );
    break;
  }
  default:
    usage(
      'mcp.mjs tools|call <tool> [jsonArgs|@file] [--max N]|raw <method> [jsonParams]|init [protocolVersion]',
    );
}
