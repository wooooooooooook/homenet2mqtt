#!/usr/bin/env node
// 캡처 로그에서 패킷 그룹별 변동(변하는 바이트)을 뽑는다.
// Usage: node variance.mjs <capture.txt> [--base <earlier.txt>] [--prefix 2] [--length 8] [--show 6]
import fs from 'node:fs';

const argv = process.argv.slice(2);
const file = argv[0];
if (!file) {
  console.error(
    'Usage: node variance.mjs <capture.txt> [--base f] [--prefix n] [--length n] [--show n]',
  );
  process.exit(2);
}
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const PREFIX = Number(opt('prefix', 2));
const LENGTH = Number(opt('length', 0)) || 0;
const SHOW = Number(opt('show', 6));
const BASE = opt('base', null);

function parse(f) {
  const out = [];
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\[([^\]]+)\] \[([^\]]+)\] \[(RX|TX)\] ([0-9a-fA-F]+)$/);
    if (!m) continue;
    let hex = m[4].toLowerCase();
    if (LENGTH && hex.length > LENGTH * 2) {
      for (let i = 0; i + LENGTH * 2 <= hex.length; i += LENGTH * 2)
        out.push({ ts: m[1], port: m[2], dir: m[3], hex: hex.slice(i, i + LENGTH * 2) });
      continue;
    }
    out.push({ ts: m[1], port: m[2], dir: m[3], hex });
  }
  return out;
}

const baseSet = BASE ? new Set(parse(BASE).map((p) => p.hex)) : null;
const groups = new Map();
for (const p of parse(file)) {
  const key = `${p.dir}|${p.port}|${p.hex.slice(0, PREFIX * 2)}`;
  if (!groups.has(key)) groups.set(key, new Map());
  const g = groups.get(key);
  if (!g.has(p.hex)) g.set(p.hex, { n: 0, first: p.ts, last: p.ts });
  const r = g.get(p.hex);
  r.n++;
  r.last = p.ts;
}

console.log(`groups=${groups.size}  (prefix=${PREFIX}B)`);
for (const [key, g] of [...groups].sort()) {
  const vals = [...g.keys()];
  const width = Math.min(...vals.map((v) => v.length)) / 2;
  const vary = [];
  for (let i = 0; i < width; i++) {
    if (new Set(vals.map((v) => v.slice(i * 2, i * 2 + 2))).size > 1) vary.push(i);
  }
  const flag = baseSet ? ` new=${vals.filter((v) => baseSet.has(v) === false).length}` : '';
  if (vals.length === 1) {
    // 정적 그룹은 한 줄로 압축 (변동 없음 = 이 그룹에서는 필드 의미를 확정 불가)
    const r = g.get(vals[0]);
    console.log(
      `${key}  STATIC n=${r.n} ${vals[0]}${baseSet && !baseSet.has(vals[0]) ? ' <== NEW' : ''}`,
    );
    continue;
  }
  console.log(
    `\n${key}  uniq=${vals.length} total=${[...g.values()].reduce((s, r) => s + r.n, 0)} varyBytes=[${vary}]${flag}`,
  );
  for (const v of vals.slice(0, SHOW)) {
    const r = g.get(v);
    console.log(
      `   ${v}${baseSet && !baseSet.has(v) ? ' <== NEW' : ''}  n=${r.n} ${r.first.slice(11, 23)}..${r.last.slice(11, 23)}`,
    );
  }
  if (vals.length > SHOW) console.log(`   ... ${vals.length - SHOW} more`);
}
