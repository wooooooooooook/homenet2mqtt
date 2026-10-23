#!/usr/bin/env node
// 벤더 미상 환경에서 예제 설정을 자동 매칭한다.
// test-serial은 raw 바이트만 주므로(체크섬/프레이밍 미검증), 여기서 자체 검증한다.
// Usage: node probe.mjs <serialPath> [--baud 9600] [--parity none] [--stop 1] [--bits 8]
//        [--rounds 3] [--portId rawprobe] [--stream "<hex>"]  (--stream 은 생 캡처 대입용)
import { req } from './lib.mjs';

const argv = process.argv.slice(2);
const path = argv[0];
if (!path || path.startsWith('--')) {
  console.error(
    'Usage: node probe.mjs <serialPath> [--baud n] [--parity p] [--stop n] [--bits n] [--rounds n] [--stream hex]',
  );
  process.exit(2);
}
const flag = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const serialConfig = {
  portId: flag('portId', 'rawprobe'),
  path,
  baud_rate: Number(flag('baud', 9600)),
  data_bits: Number(flag('bits', 8)),
  parity: flag('parity', 'none'),
  stop_bits: Number(flag('stop', 1)),
};

const UNSUPPORTED = ['bestin_sum', 'samsung_xor', 'samsung_rx', 'samsung_tx'];

// add / xor 계열만 내장 구현 (core 의 addRange/xorRange 와 동일: sum & 0xff)
function expect(type, buf, ckIdx, hdrLen) {
  const noHdr = /_no_header/.test(type);
  const start = noHdr ? hdrLen : 0;
  const m = type.match(/add_final_xor(?:_no_header)?\(0x([0-9a-fA-F]+)\)/);
  const range = (op) => {
    let v = 0;
    for (let i = start; i < ckIdx; i++) v = op === 'add' ? v + buf[i] : v ^ buf[i];
    return op === 'add' ? v & 0xff : v;
  };
  if (m) {
    const base = range('add');
    return (base ^ parseInt(m[1], 16)) & 0xff;
  }
  if (type === 'add' || type === 'add_no_header') return range('add');
  if (type === 'xor' || type === 'xor_no_header') return range('xor');
  return null; // none / crc8 / 벤더 전용
}

function score(bytes, f) {
  const hdr = f.rx_header ?? [];
  const ftr = f.rx_footer ?? [];
  const cksum = f.rx_checksum ?? 'none';
  const verified = cksum !== 'none' && !UNSUPPORTED.includes(cksum) && !cksum.startsWith('crc8');
  // 체크섬으로 검증 불가한 예제는 길이 브루트포스 자체가 무의미(아무 바이트나 성립)하므로
  // 선언된 rx_length가 있을 때만 정렬 평가한다.
  const lens = f.rx_length
    ? [f.rx_length]
    : verified
      ? Array.from({ length: 21 }, (_, i) => i + 4)
      : [];
  let best = { len: 0, frames: 0, coverage: 0 };
  for (const L of lens) {
    if (L <= hdr.length + ftr.length + 1) continue;
    let frames = 0;
    let i = 0;
    while (i + L <= bytes.length) {
      const frame = bytes.slice(i, i + L);
      const okHdr = hdr.every((b, k) => frame[k] === b);
      const okFtr = ftr.every((b, k) => frame[L - ftr.length + k] === b);
      const ckIdx = L - ftr.length - 1;
      const want = verified ? expect(cksum, frame, ckIdx, hdr.length) : null;
      const okCk = !verified || want === frame[ckIdx];
      if (okHdr && okFtr && okCk) {
        frames++;
        i += L;
      } else {
        i++;
      }
    }
    if (frames * L > best.coverage) best = { len: L, frames, coverage: frames * L };
  }
  return { ...best, total: bytes.length, verified, checksum: cksum };
}

const bytes = [];
if (flag('stream', null)) {
  for (const h of flag('stream', '').replace(/\s/g, '').match(/../g) ?? [])
    bytes.push(parseInt(h, 16));
} else {
  const rounds = Number(flag('rounds', 3));
  for (let i = 0; i < rounds; i++) {
    const r = await req('POST', '/setup/test-serial', {
      body: { example: '__empty__', serialConfig },
    });
    for (const hex of r.packets) for (const h of hex.match(/../g)) bytes.push(parseInt(h, 16));
  }
}
if (bytes.length < 8) {
  console.log(`수신 바이트 부족(${bytes.length}) — 배선/경로 확인`);
  process.exit(1);
}

const setup = await req('GET', '/setup');
const rows = [];
for (const filename of setup.examples) {
  const e = await req('GET', `/setup/examples/${filename}`);
  const f = e.packetDefaults ?? {};
  const s = score(bytes, f);
  rows.push({
    filename,
    s,
    serial: e.serial,
    entities: Object.entries(e.entities ?? {})
      .map(([k, v]) => `${k}:${v.length}`)
      .join(' '),
  });
}

const line = (r) => {
  const f = r.s;
  return `${r.filename.padEnd(42)} frames=${String(f.frames).padStart(3)} len=${String(f.len).padStart(2)} cov=${String(Math.round((f.coverage / f.total) * 100)).padStart(3)}% cksum=${String(f.checksum)}`;
};

// 체크섬을 실제로 검증 가능한 후보만 순위화한다. 미지원/none 후보는
// 임의 길이에서도 100%가 나오므로 추천 근거로 쓰지 않는다.
const verifiedRows = rows
  .filter((r) => r.s.verified)
  .sort((a, b) => b.s.coverage - a.s.coverage || b.s.frames - a.s.frames);
const weakRows = rows.filter((r) => !r.s.verified);

console.log(`raw ${bytes.length} bytes collected (rounds of test-serial, 예제 미편향)\n`);
console.log('[체크섬 검증 가능한 후보]');
for (const r of verifiedRows) console.log('  ' + line(r));
console.log('\n[판정 불가 후보 — 내장 체크섬 미지원 또는 checksum none]');
for (const r of weakRows)
  console.log(
    '  ' + line(r) + (r.s.checksum === 'none' ? '  ← 헤더/엔티티 매칭으로만 판별 가능' : ''),
  );

const top = verifiedRows[0];
if (top && top.s.frames >= 3 && top.s.coverage / top.s.total >= 0.6) {
  const runner = verifiedRows[1];
  const gap = runner ? (top.s.coverage - runner.s.coverage) / top.s.total : 1;
  console.log(
    `\n최유력: ${top.filename}  portId=${top.serial.portId} serial=${top.serial.baud_rate}/${top.serial.parity}/${top.serial.stop_bits}`,
  );
  console.log(`엔티티: ${top.entities}`);
  console.log(
    gap >= 0.3
      ? `차별도: 2위와 coverage 차이 ${Math.round(gap * 100)}% — 충분`
      : '주의: 2위와 근접 — 라운드 추가(--rounds) 또는 상태 변동 후 재시행',
  );
} else if (top) {
  console.log(
    `\n유력 후보 없음 (최고 ${top.filename} cov=${Math.round((top.s.coverage / top.s.total) * 100)}%)`,
  );
} else {
  console.log(
    '\n체크섬으로 검증 가능한 예제가 없음 — 판정 불가 후보의 header/footer 길이를 수동 확인 필요',
  );
}
