#!/usr/bin/env node
// 갤러리(엔티티 스니펫 저장소) 탐색: 예제 확정 후 미매칭 패킷을 줄일 스니펫을 고른다.
// Agent API가 있으면 우선적으로 h2m.mjs gallery|gallery-match|gallery-show 를 쓴다(GitHub 우선 조회).
// 이 스크립트는 로컬 체크아웃/구버전 배포용 폴백이며, expand(템플릿 펼침)는 API에도 없다.
// Usage:
//   node gallery.mjs list <vendor> [--dir gallery]
//   node gallery.mjs show <vendor> <snippet.yaml>
//   node gallery.mjs check <vendor> --packets "<hex stream | hex hex ...>" [--length 8]
//   node gallery.mjs expand <vendor> <snippet.yaml> --ids 3,4   # $repeat 펼침 + hex→10진 (JSON 초안 직전 YAML)
// 예: node gallery.mjs check commax --packets "828001231600003f b0010100000000b2" --length 8
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const [cmd, vendor, target] = argv;
const flag = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
if (!cmd || !['list', 'show', 'check', 'expand'].includes(cmd) || !vendor) {
  console.error(
    'Usage: gallery.mjs <list|show|check|expand> <vendor> [snippet.yaml] [--dir ROOT] [--packets "hex ..."] [--length N] [--ids 3,4 | --from 1 --count 4]',
  );
  process.exit(2);
}
const root = flag('dir', 'gallery');
const dir = path.isAbsolute(vendor) ? vendor : path.join(root, vendor);
if (!fs.existsSync(dir)) {
  const avail = fs.existsSync(root)
    ? fs
        .readdirSync(root)
        .filter((f) => f.endsWith('.yaml') || fs.statSync(path.join(root, f)).isDirectory())
        .filter((f) => !f.includes('.json'))
        .join(', ')
    : '(gallery 루트 없음 — --dir 로 절대경로 지정)';
  console.log(`갤러리 폴더 없음: ${dir}\n사용 가능한 vendor: ${avail}`);
  process.exit(1);
}

const hexList = (s) =>
  (s?.match(/0x[0-9A-Fa-f]+|\d+/g) ?? []).map((t) => parseInt(t, t.startsWith('0x') ? 16 : 10));

function inspect(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const at = (re) => lines.findIndex((l) => re.test(l));
  const one = (re) =>
    lines
      .find((l) => re.test(l))
      ?.match(re)?.[1]
      ?.trim();

  // discovery: 블록(인덱스 0) 내부에서 match / dimensions / inference 를 indentation 으로 잘라낸다.
  const dIdx = at(/^discovery:/);
  const disc = [];
  if (dIdx >= 0) {
    for (let i = dIdx + 1; i < lines.length; i++) {
      const l = lines[i];
      if (l.trim() && !/^\s/.test(l)) break;
      disc.push(l);
    }
  }
  const discText = disc.join('\n');
  const raw = (k) => discText.match(new RegExp(`^\\s+${k}:\\s*\\[.*\\]`, 'm'))?.[0];
  const dataRaw = raw('data');
  const maskRaw = raw('mask');

  const params = [];
  const pIdx = at(/^parameters:/);
  if (pIdx >= 0) {
    for (let i = pIdx + 1; i < lines.length; i++) {
      const l = lines[i];
      if (l.trim() && !/^\s/.test(l)) break;
      const nm = l.match(/^\s+-\s+name:\s*(\S+)/);
      if (nm) params.push({ name: nm[1] });
      else if (params.length) {
        const kv = l.match(/^ {4}(type|default|min|max):\s*(\S+)/);
        if (kv) params.at(-1)[kv[1]] = kv[2];
      }
    }
  }

  const dims = [
    ...discText.matchAll(/parameter:\s*"?'?(\w+)"?'?\s*\n\s+(?:index|offset):\s*(\d+)/g),
  ].map((m) => ({ parameter: m[1], index: Number(m[2]) }));
  const entText = text.slice(at(/^entities:/) >= 0 ? text.indexOf('entities:') : 0);
  const types = [
    ...new Set(
      [
        ...entText.matchAll(
          /^ {2}(light|climate|sensor|fan|switch|valve|button|number|select|binary_sensor|lock|text|cover|humidifier):$/gm,
        ),
      ].map((m) => m[1]),
    ),
  ];
  const ids = [...new Set([...entText.matchAll(/^\s+id:\s*'([^']+)'/gm)].map((m) => m[1]))];
  const repeats = [];
  for (const m of text.matchAll(
    /- \$repeat:\n\s+count:\s*'?\{\{(\w+)\}\}'?[\s\S]{0,120}?start:\s*(\d+)/g,
  )) {
    repeats.push({ parameter: m[1], start: Number(m[2]) });
  }

  return {
    name: path.basename(file),
    title: one(/^ {2}name_en:\s*"([^"]+)"/) ?? one(/^ {2}name:\s*"([^"]+)"/),
    version: one(/^ {2}version:\s*"([^"]+)"/),
    tags: one(/^ {2}tags:\s*\[(.*)\]/),
    types,
    ids,
    repeats,
    params,
    dims,
    match: dataRaw && maskRaw ? { data: hexList(dataRaw), mask: hexList(maskRaw) } : null,
    text,
  };
}

const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => inspect(path.join(dir, f)));

if (cmd === 'show') {
  const f = files.find((x) => x.name === target);
  if (!f) {
    console.log(`스니펫 없음: ${target}\n후보: ${files.map((x) => x.name).join(', ')}`);
    process.exit(1);
  }
  console.log(f.text);
  process.exit(0);
}

if (cmd === 'expand') {
  const f = files.find((x) => x.name === target);
  if (!f) {
    console.log(`스니펫 없음: ${target}\n후보: ${files.map((x) => x.name).join(', ')}`);
    process.exit(1);
  }
  const ids = (flag('ids', '') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const from = Number(flag('from', '1'));
  const count = Number(flag('count', '0')) || (ids.length ? 0 : Number(f.params[0]?.default ?? 1));
  const channels = ids.length ? ids : Array.from({ length: count }, (_, k) => String(from + k));
  const eIdx = f.text.indexOf('\nentities:\n');
  if (eIdx < 0) {
    console.log(
      '이 스니펫에는 entities: 블록이 없습니다(automations 전용일 수 있음). show 로 원문을 확인하세요.',
    );
    process.exit(1);
  }
  const lines = f.text.slice(eIdx + '\nentities:\n'.length).split('\n');
  const out = ['entities:'];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\S/.test(l)) break;
    if (/^ {2}\w.*:$/.test(l) && !/^\s*#/.test(l)) {
      out.push(`  ${l.trim().slice(0, -1)}:`);
      continue;
    }
    if (/^ {4}- \$repeat:/.test(l)) {
      let end = i + 1;
      while (end < lines.length && !/^ {4}- /.test(lines[end]) && !/^\S/.test(lines[end])) end++;
      const body = lines
        .slice(i, end)
        .join('\n')
        .replace(/^ {4}- \$repeat:\n(?: {8}\S.*\n)+/, '')
        .replace(/^ {6}id:/m, '    - id:');
      for (const ch of channels) out.push(body.replace(/\{\{i\}\}/g, ch) + '\n');
      i = end - 1;
      continue;
    }
    out.push(l);
  }
  const toDec = (inner) =>
    inner
      .split(',')
      .map((t) => t.trim().replace(/^'+|'+$/g, ''))
      .filter(Boolean)
      .map((t) =>
        /^0x[0-9A-Fa-f]+$/.test(t) ? String(parseInt(t, 16)) : /^\d+$/.test(t) ? t : `'${t}'`,
      )
      .join(', ');
  const y = out
    .join('\n')
    .split('\n')
    .map((l) =>
      /^(\s*)(data|ack|mask):\s*\[([^\]]*)\]\s*$/.test(l)
        ? l.replace(
            /^(\s*)(data|ack|mask):\s*\[([^\]]*)\]\s*$/,
            (_m, sp, k, inner) => `${sp}${k}: [${toDec(inner)}]`,
          )
        : l,
    )
    .join('\n')
    .replace(/\n\n+/g, '\n')
    .trimEnd();
  console.log(
    `# gallery/${vendor}/${f.name} $repeat 펼침 (채널=${channels.join(',')}) — hex→10진 변환 포함`,
  );
  console.log(y);
  const left = [...new Set([...y.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]))].filter(
    (v) => v !== 'i',
  );
  if (left.length) {
    console.log(
      `\n# 미해결 템플릿 변수: ${left.join(', ')} — 이 스니펫은 $repeat 외에 $nested / object[] 파라미터(방별 설정 등)를 사용한다.`,
    );
    console.log(
      '# show 로 원문을 열어 중첩 반복 구조를 확인하고, 채널별로 손으로 펼쳐야 한다. 위 출력은 골자만 펼친 것이다.',
    );
  }
  console.log('\n# 이 YAML을 JSON 초안으로 변환해 /entities/analyze·/entities/apply 에 사용한다.');
  console.log(
    '# 접두/ack/mask 바이트가 라이브 설정의 동일 타입 엔티티(/entities --full)와 어긋나면 라이브 값을 기준으로 고친다.',
  );
  process.exit(0);
}

const reqFile = path.join(dir, 'requirements.json');
if (fs.existsSync(reqFile)) {
  console.log(
    `framing(requirements.json): ${fs.readFileSync(reqFile, 'utf8').replace(/\s+/g, ' ').slice(0, 320)}`,
  );
}

const framesOf = (raw, len) => {
  const compact = raw.replace(/\s+/g, '');
  const all = compact.match(/../g)?.map((h) => parseInt(h, 16)) ?? [];
  if (len && compact.split(/\s+/).length <= 1) {
    const out = [];
    for (let i = 0; i + len <= all.length; i += len) out.push(all.slice(i, i + len));
    return out;
  }
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => (tok.match(/../g) ?? []).map((h) => parseInt(h, 16)));
};

const tokens = flag('packets', '');
const observed = tokens ? framesOf(tokens, Number(flag('length', 0)) || undefined) : [];
console.log(
  `vendor=${vendor} snippets=${files.length}${cmd === 'check' ? ` (관측 프레임=${observed.length})` : ''}`,
);

for (const f of files) {
  if (cmd === 'check') {
    if (!f.match) continue;
    const hits = [];
    for (const [fi, frame] of observed.entries()) {
      if (f.match.data.some((b, k) => (frame[k] & f.match.mask[k]) !== (b & f.match.mask[k])))
        continue;
      if (f.match.data.length > frame.length) continue;
      hits.push(fi);
    }
    if (!hits.length) continue;
    const suggest = f.dims
      .map((d) => {
        const vals = [
          ...new Set(hits.map((i) => observed[i][d.index]).filter((v) => v !== undefined)),
        ].sort((a, b) => a - b);
        const p = f.params.find((x) => x.name === d.parameter);
        return `${d.parameter}: 채널값=${vals.map((v) => '0x' + v.toString(16).padStart(2, '0')).join(',')} → max=${Math.max(...vals)}${p ? ` (허용 ${p.min ?? '?'}..${p.max ?? '?'}, 기본 ${p.default ?? '?'})` : ''}`;
      })
      .join(' | ');
    console.log(
      `  HIT ${f.name.padEnd(26)} n=${String(hits.length).padStart(3)} types=${f.types.join(',') || '-'} ids=${f.ids.join(',')}`,
    );
    if (suggest) console.log(`      ${suggest}`);
    continue;
  }
  console.log(
    `  ${f.name.padEnd(32)} v${f.version ?? '?'} ${(f.title ?? '-').padEnd(18)} types=${f.types.join(',') || '-'} params=${f.params.map((p) => `${p.name}${p.type && p.type !== 'integer' ? ':' + p.type : ''}${p.default ? `=${p.default}` : ''}${p.min ? `(${p.min}..${p.max})` : ''}`).join(',') || '-'} match=[${f.match ? f.match.data.map((b) => '0x' + b.toString(16)).join(',') + '/' + f.match.mask.map((b) => '0x' + b.toString(16)).join(',') : '없음'}] ids=${f.ids.slice(0, 4).join(',')}`,
  );
}

if (cmd === 'check') {
  console.log(
    '\nHIT 스니펫만 `show`로 열어 meta 프로토콜 표와 entities를 확인하고, 관측된 채널만 expand로 펼친다:',
  );
  console.log(`  node gallery.mjs expand ${vendor} <hit>.yaml --ids <관측 채널 목록(예: 3,4)>`);
  console.log(
    '그래도 남는 프레임은 개수 파라미터 상한/타입 누락 여부를 확인한 뒤 1~8단계 역산 대상으로 넘긴다.',
  );
} else {
  console.log(`\n스니펫 내용: node gallery.mjs show ${vendor} <file>.yaml`);
  console.log(
    '관측 패킷과 대조: node gallery.mjs check ' +
      vendor +
      ' --packets "<hex>" --length <프레임길이>',
  );
}
