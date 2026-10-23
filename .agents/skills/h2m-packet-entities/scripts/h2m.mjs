#!/usr/bin/env node
// Homenet2MQTT Agent API 클라이언트. 환경변수: H2M_TOKEN(필수), H2M_URL(기본 http://127.0.0.1:3001/api/v1/agent)
import fs from 'node:fs';
import { req, printJson, usage } from './lib.mjs';

const [cmd, ...a] = process.argv.slice(2);
const q = (o) => {
  const s = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));
  return s.size ? `?${s}` : '';
};
const readDraft = (file) => {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const root = j.draft ?? j;
  return {
    entities: root.entities ?? {},
    automations: root.automations,
    packetDefaults: root.packetDefaults,
  };
};

switch (cmd) {
  case 'info': {
    const caps = await req('GET', '/capabilities');
    const ports = await req('GET', '/ports');
    console.log(
      `features: ${Object.entries(caps.features)
        .filter(([, v]) => v)
        .map(([k]) => k)}  version: ${caps.serviceVersion}`,
    );
    for (const p of ports.ports) {
      const d = p.packetDefaults;
      console.log(
        `port=${p.portId} status=${p.status} file=${p.configFile} serial=${p.serial.path}@${p.serial.baudRate}/${p.serial.parity?.[0] ?? '?'}/${p.serial.stopBits} rxlen=${d.rx_length} rxsum=${d.rx_checksum} txsum=${d.tx_checksum} rxhdr=${JSON.stringify(d.rx_header)} entities=${JSON.stringify(p.entityCounts)}`,
      );
    }
    break;
  }
  case 'get':
    if (!a[0]) usage('h2m.mjs get <path> [limit]');
    printJson(await req('GET', a[0]), Number(a[1]) || 4000);
    break;
  case 'post':
    if (!a[0]) usage('h2m.mjs post <path> [jsonBody]');
    printJson(
      await req('POST', a[0], { body: a[1] ? JSON.parse(a[1]) : {} }),
      Number(a[2]) || 4000,
    );
    break;
  case 'setup':
    printJson(await req('GET', '/setup'), 6000);
    break;
  case 'entities':
    for (const e of (await req('GET', `/entities${q({ portId: a[0] })}`)).entities) {
      console.log(`[${e.entityType}] ${e.id}  file_port=${e.portId}`);
      if (a[1] === '--full') printJson(e.config, 1500);
    }
    break;
  case 'unmatched': {
    const r = await req('GET', `/packets/unmatched${q({ portId: a[0] })}`);
    console.log(`count=${r.count}`);
    for (const p of r.packets)
      console.log(
        `${p.packet}  n=${p.count}  first=${p.firstSeen?.slice(11, 19)} last=${p.lastSeen?.slice(11, 19)}`,
      );
    break;
  }
  case 'history': {
    const r = await req('GET', `/packets/history${q({ portId: a[0], limit: a[1] ?? 50 })}`);
    for (const p of r.packets)
      console.log(
        `${p.type}\t${p.packet}\t${p.entityId ?? '-'}\t${JSON.stringify(p.state ?? p.command ?? '')}`,
      );
    break;
  }
  case 'capture': {
    const [sub, portId, extra] = a;
    if (sub === 'start')
      printJson(await req('POST', '/capture/start', { body: { portId, mode: extra || 'all' } }));
    else if (sub === 'stop') printJson(await req('POST', '/capture/stop', { body: { portId } }));
    else if (sub === 'status') printJson(await req('GET', `/capture${q({ portId })}`));
    else if (sub === 'files')
      for (const f of (await req('GET', '/capture/files')).files)
        console.log(`${f.filename}\t${f.size}\t${f.createdAt}`);
    else if (sub === 'get') {
      if (!portId) usage('h2m.mjs capture get <filename> [outfile]');
      const out = extra || portId.replace(/[^\w.+-]/g, '_');
      const buf = await req('GET', `/capture/files/${encodeURIComponent(portId)}`, { raw: true });
      fs.writeFileSync(out, buf);
      console.log(`saved -> ${out} (${buf.length} bytes)`);
    } else if (sub === 'delete') {
      if (!portId) usage('h2m.mjs capture delete <filename>');
      printJson(await req('DELETE', `/capture/files/${encodeURIComponent(portId)}`));
    } else if (sub === 'wait') {
      if (!portId) usage('h2m.mjs capture wait <portId> [timeoutSec=60] [intervalSec=5]');
      const timeoutMs = (Number(extra) || 60) * 1000;
      const intervalMs = (Number(a[3]) || 5) * 1000;
      // /packets/history 는 매칭된 패킷만 담는다. 무트래픽 판정은 capture(원시 프레임) 카운터로 해야 한다.
      let st = (await req('GET', `/capture${q({ portId })}`)).status;
      let owned = false;
      if (!st.isLogging) {
        owned = true;
        st = (await req('POST', '/capture/start', { body: { portId, mode: 'all' } })).status;
      }
      const base = st.packetCount ?? 0;
      console.log(
        `capture=${st.filename} 기준 패킷수=${base} — ${Math.round(timeoutMs / 1000)}초간 원시 프레임 수신 대기`,
      );
      const poll = async () => (await req('GET', `/capture${q({ portId })}`)).status;
      const stop = async () => {
        if (owned) await req('POST', '/capture/stop', { body: { portId } });
      };
      const tail = async (file) => {
        const buf = await req('GET', `/capture/files/${encodeURIComponent(file)}`, { raw: true });
        return buf
          .toString('utf8')
          .split('\n')
          .filter((l) => l.trim())
          .slice(-12);
      };
      let lastLog = Date.now();
      const until = Date.now() + timeoutMs;
      while (Date.now() < until) {
        await new Promise((r) => setTimeout(r, intervalMs));
        const now = await poll();
        if ((now.packetCount ?? 0) > base) {
          console.log(
            `TRAFFIC +${now.packetCount - base}패킷 (총 ${now.packetCount}) — 폴링형 버스: 레코딩만으로도 수집됩니다`,
          );
          for (const l of await tail(now.filename ?? st.filename)) console.log('  ' + l);
          await stop();
          process.exit(0);
        }
        if (Date.now() - lastLog >= 20000) {
          lastLog = Date.now();
          console.log(`  … 원시 프레임 0건 (${Math.round((until - Date.now()) / 1000)}초 남음)`);
        }
      }
      await stop();
      console.log(
        'NO_TRAFFIC — RX/TX 원시 프레임이 0건입니다. /ports status가 started라면 이 버스는 이벤트형(월패드·스위치 조작 시에만 송수신)일 가능성이 높습니다. 사용자에게 요청: "월패드 화면을 켜서 전등 ON/OFF, 난방 목표온도 변경, 환기팬 모드 변경 등을 1~2분간 직접 조작해 주세요" → 조작 직전에 이 명령을 다시 실행하면 상태 프레임과 TX/ACK까지 함께 기록됩니다. status가 error/stopped이거나 계속 0건이면 배선·브리지 경로부터 확인하세요.',
      );
      process.exit(3);
    } else
      usage(
        'h2m.mjs capture <start|stop|status|wait|files|get|delete> [portId] [mode|filename|timeoutSec] [outfile|intervalSec]',
      );
    break;
  }
  case 'analyze': {
    if (!a[1]) usage('h2m.mjs analyze <portId> <draft.json> <hex...>');
    const draft = readDraft(a[1]);
    const ids = new Set(
      Object.values(draft.entities ?? {})
        .flat()
        .map((e) => e.id),
    );
    const r = await req('POST', '/packets/analyze', {
      body: { portId: a[0], input: a.slice(2).join(' '), draft },
    });
    console.log(
      `source=${r.source} draftValid=${r.draftValid} draftApplicable=${r.draftApplicable}`,
    );
    for (const p of r.packets) {
      const mine = (p.matches || []).filter((m) => ids.has(m.entityId));
      const other = (p.matches || []).filter((m) => !ids.has(m.entityId));
      console.log(
        `${p.hex}  MINE=${mine.map((m) => `${m.entityId}=${JSON.stringify(m.state)}`).join(' | ') || 'NONE'}  OTHER=${other.map((m) => m.entityId).join(',') || '-'}`,
      );
    }
    for (const u of r.unmatchedPackets || []) console.log(`UNMATCHED ${u.hex ?? u.packet ?? u}`);
    if (r.draftValidationErrors?.length)
      console.log(`validationErrors: ${JSON.stringify(r.draftValidationErrors)}`);
    if (r.draftConflicts?.length) console.log(`conflicts: ${JSON.stringify(r.draftConflicts)}`);
    if (r.errors?.length) console.log(`errors: ${JSON.stringify(r.errors)}`);
    break;
  }
  case 'validate': {
    if (!a[1]) usage('h2m.mjs validate <portId> <draft.json>');
    const r = await req('POST', '/entities/validate', {
      body: { portId: a[0], ...readDraft(a[1]), discoveryPreview: true },
    });
    console.log(`valid=${r.valid} applicable=${r.applicable} restartRequired=${r.restartRequired}`);
    console.log(`draftHash=${r.draftHash}`);
    if (r.errors?.length) console.log(`errors: ${JSON.stringify(r.errors)}`);
    if (r.warnings?.length) console.log(`warnings: ${JSON.stringify(r.warnings)}`);
    if (r.conflicts?.length) console.log(`conflicts: ${JSON.stringify(r.conflicts)}`);
    for (const d of r.discovery || [])
      console.log(`discovery ${d.entityType}/${d.draftId} topic=${d.topic}`);
    break;
  }
  case 'apply': {
    if (!a[2]) usage('h2m.mjs apply <portId> <draft.json> <draftHash> [--restart]');
    console.log(
      '!! /entities/apply 는 YAML에 쓰고 재시작할 수 있습니다. draftHash는 validate 직후 것만 유효합니다.',
    );
    printJson(
      await req('POST', '/entities/apply', {
        body: {
          portId: a[0],
          ...readDraft(a[1]),
          draftHash: a[2],
          restart: a.includes('--restart'),
        },
      }),
    );
    break;
  }
  case 'preview': {
    if (!a[1]) usage('h2m.mjs preview <portId> <hex> [--no-checksum]');
    printJson(
      await req('POST', '/packets/preview', {
        body: {
          portId: a[0],
          hex: a[1].replace(/\s/g, ''),
          checksum: !a.includes('--no-checksum'),
        },
      }),
    );
    break;
  }
  default:
    usage('info|setup|get|post|entities|unmatched|history|capture|analyze|validate|apply|preview');
}
