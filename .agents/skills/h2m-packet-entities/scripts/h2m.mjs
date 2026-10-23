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
    } else
      usage(
        'h2m.mjs capture <start|stop|status|files|get|delete> [portId] [mode|filename] [outfile]',
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
