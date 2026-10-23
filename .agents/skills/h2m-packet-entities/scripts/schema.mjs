#!/usr/bin/env node
// h2m 설정 JSON 스키마 조회 — Agent API(GET /schema, /schema/:name)를 Bearer 토큰으로 읽는다.
// 전체 스키마는 120KB가 넘으므로 통째로 덤프하지 않고 정의/필드 단위로 잘라 출력한다.
// Usage:
//   node schema.mjs list                                  # 이 빌드에 동봉된 스키마 이름
//   node schema.mjs types                                 # 엔티티 타입 → 정의 이름
//   node schema.mjs fields <type|DefName> [--desc] [--json]
//   node schema.mjs def <DefName>                         # 정의 하나를 그대로(제약 포함)
// 공통 플래그: --url <Agent API base>  (기본: H2M_URL, 예 http://host:3001/api/v1/agent)
import { BASE, fetchJson, usage } from './lib.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const has = (n) => argv.includes(`--${n}`);
const positional = argv.filter((arg, i) => !arg.startsWith('--') && !argv[i - 1]?.startsWith('--'));
const [cmd, target] = positional;

const override = flag('url');
const SHOWN_BASE = (override ?? BASE).replace(/\/+$/, '');
const endpoint = (suffix) => (override ? `${SHOWN_BASE}/schema${suffix}` : `/schema${suffix}`);

const CONFIG_SCHEMA = 'homenet-bridge';

function explain(res) {
  if (res.error) {
    console.error(
      `ERROR: ${res.url} 에 연결하지 못했습니다 (${res.error.code ?? res.error.message}).\n` +
        'H2M_URL과 Agent API 토글(설정 > Agent API)을 확인하세요.',
    );
    process.exit(2);
  }
  if (res.status === 401) {
    console.error(
      `ERROR: 401 ${res.url} — 토큰이 유효하지 않습니다. 설정 > Agent API에서 재발급한 토큰을 H2M_TOKEN에 넣으세요.`,
    );
    process.exit(2);
  }
  if (res.status === 404) {
    console.error(
      `ERROR: 404 ${res.url} — 이 배포에는 /schema가 없습니다(구버전).\n` +
        'references/entity-schema.md의 필드 요약으로 초안을 만들고 validate로 확인하세요.',
    );
    process.exit(2);
  }
  console.error(`ERROR: HTTP ${res.status} ${res.url} -> ${res.text.slice(0, 300)}`);
  process.exit(2);
}

async function loadSchema() {
  const res = await fetchJson('GET', endpoint(`/${CONFIG_SCHEMA}`));
  if (!res.ok) explain(res);
  const defs = res.json?.definitions ?? res.json?.$defs ?? {};
  if (!Object.keys(defs).length) {
    console.error('ERROR: 스키마에 definitions가 없습니다. 응답이 예상 형식이 아닙니다.');
    process.exit(2);
  }
  console.log(`# ${CONFIG_SCHEMA} schema defs=${Object.keys(defs).length} base=${SHOWN_BASE}`);
  return defs;
}

// schema.routes.ts / agent schema service의 타입 매핑과 같아야 한다.
const TYPE_TO_DEF = {
  light: 'LightEntity',
  climate: 'ClimateEntity',
  valve: 'ValveEntity',
  button: 'ButtonEntity',
  sensor: 'SensorEntity',
  fan: 'FanEntity',
  switch: 'SwitchEntity',
  lock: 'LockEntity',
  number: 'NumberEntity',
  select: 'SelectEntity',
  text_sensor: 'TextSensorEntity',
  text: 'TextEntity',
  binary_sensor: 'BinarySensorEntity',
  automation: 'AutomationConfig',
  script: 'ScriptConfig',
};
const DEF_TO_TYPE = Object.fromEntries(Object.entries(TYPE_TO_DEF).map(([t, d]) => [d, t]));

function describe(v) {
  if (!v || typeof v !== 'object') return 'any';
  if (v.enum) return `enum{${v.enum.join('|')}}`;
  if (v.const !== undefined) return `const(${JSON.stringify(v.const)})`;
  for (const key of ['anyOf', 'oneOf']) {
    if (Array.isArray(v[key])) return [...new Set(v[key].map(describe))].join('|');
  }
  if (v.$ref) return v.$ref.split('/').pop();
  if (v.type === 'array') return `array<${v.items ? describe(v.items) : 'any'}>`;
  if (v.type) return v.type;
  if (v.additionalProperties) return 'object';
  return 'any';
}

if (!cmd) usage('schema.mjs list|types|fields <type|DefName> [--desc|--json] | def <DefName> [--url BASE]');

if (cmd === 'list') {
  const res = await fetchJson('GET', endpoint(''));
  if (!res.ok) explain(res);
  console.log(`# base=${SHOWN_BASE}`);
  for (const name of res.json?.schemas ?? []) console.log(name);
} else if (cmd === 'types') {
  const defs = await loadSchema();
  for (const [type, def] of Object.entries(TYPE_TO_DEF)) {
    const d = defs[def];
    console.log(
      `${type.padEnd(14)} -> ${def.padEnd(22)} props=${Object.keys(d?.properties ?? {}).length}`,
    );
  }
  const extra = Object.keys(defs).filter((d) => !DEF_TO_TYPE[d]);
  console.log(`# 그 외 정의(직접 지정 가능): ${extra.join(', ')}`);
} else if (cmd === 'fields') {
  const defs = await loadSchema();
  if (!target) {
    console.error('ERROR: fields <type|DefName> — types 로 목록을 먼저 보세요.');
    process.exit(2);
  }
  const defName = TYPE_TO_DEF[target] ?? target;
  const def = defs[defName];
  if (!def) {
    const near = Object.keys(defs)
      .filter((d) => d.toLowerCase().includes(target.toLowerCase()))
      .slice(0, 6);
    console.error(
      `ERROR: 정의 '${defName}' 없음.${near.length ? ` 비슷한 정의: ${near.join(', ')}` : ''} ` +
        `사용 가능: ${Object.keys(TYPE_TO_DEF).join(', ')} 또는 types 로 정의 이름 확인.`,
    );
    process.exit(2);
  }
  const props = Object.entries(def.properties ?? {});
  const required = new Set(def.required ?? []);
  if (has('json')) {
    console.log(
      JSON.stringify(
        {
          def: defName,
          type: DEF_TO_TYPE[defName] ?? null,
          required: [...required],
          fields: props.map(([name, v]) => ({
            name,
            kind: describe(v),
            required: required.has(name),
            enum: v.enum ?? undefined,
            description: has('desc') ? v.description : undefined,
          })),
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `## ${defName}${DEF_TO_TYPE[defName] ? ` (type=${DEF_TO_TYPE[defName]})` : ''} ` +
        `fields=${props.length} required=${[...required].join(',') || '-'}`,
    );
    const width = Math.min(34, Math.max(...props.map(([n]) => n.length)));
    for (const [name, v] of props) {
      const desc = has('desc') && v.description ? `  — ${v.description.replace(/\s+/g, ' ')}` : '';
      console.log(
        `${name.padEnd(width)}  ${describe(v).padEnd(22)} ${required.has(name) ? '*' : ' '}${desc}`,
      );
    }
    if (!has('desc')) console.log(`# 설명까지 보려면 --desc, 제약 원문은 def ${defName}`);
  }
} else if (cmd === 'def') {
  const defs = await loadSchema();
  if (!target) {
    console.error('ERROR: def <DefName>');
    process.exit(2);
  }
  const defName = TYPE_TO_DEF[target] ?? target;
  const def = defs[defName];
  if (!def) {
    console.error(`ERROR: 정의 '${defName}' 없음. types 로 목록을 확인하세요.`);
    process.exit(2);
  }
  console.log(JSON.stringify(def, null, 2));
} else {
  usage('schema.mjs list|types|fields <type|DefName> [--desc|--json] | def <DefName> [--url BASE]');
}
