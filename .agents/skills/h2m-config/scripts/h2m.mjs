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
    automations: root.automations ?? root.automation,
    scripts: root.scripts,
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
  case 'automations':
    for (const auto of (await req('GET', `/automations${q({ portId: a[0] })}`)).automations) {
      console.log(`[automation] ${auto.id}  name=${auto.name ?? '-'}  port=${auto.portId}`);
      if (a[1] === '--full') printJson(auto.config, 4000);
    }
    break;
  case 'scripts':
    for (const script of (await req('GET', `/scripts${q({ portId: a[0] })}`)).scripts) {
      console.log(
        `[script] ${script.id}  desc=${script.description ?? '-'}  port=${script.portId}`,
      );
      if (a[1] === '--full') printJson(script.config, 4000);
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
        'NO_TRAFFIC — RX/TX 원시 프레임이 0건입니다. /ports status가 started라면 이 버스는 이벤트형(월패드·스위치 조작 시에만 송수신)일 가능성이 높습니다. 사용자에게 요청: ① 월패드에서 실제로 조작 가능한 기기 목록(타입별 대수·채널)을 먼저 확인하고 ② 그 기기만 "월패드 화면을 켜서 전등 ON/OFF, 난방 목표온도 변경, 환기팬 모드 변경 등을 1~2분간 직접 조작해 주세요" → 조작 직전에 이 명령을 다시 실행하면 상태 프레임과 TX/ACK까지 함께 기록됩니다. status가 error/stopped이거나 계속 0건이면 배선·브리지 경로부터 확인하세요.',
      );
      process.exit(3);
    } else
      usage(
        'h2m.mjs capture <start|stop|status|wait|files|get|delete> [portId] [mode|filename|timeoutSec] [outfile|intervalSec]',
      );
    break;
  }
  case 'gallery': {
    // h2m.mjs gallery [vendor] — 갤러리 벤더 목록(원격 우선) 또는 벤더별 스니펫 인덱스
    const r = await req('GET', `/gallery${q({ vendor: a[0] })}`);
    if (!a[0]) {
      for (const v of r.vendors)
        console.log(
          `${v.id}\tsnippets=${v.snippetCount}\ttypes=${v.entityTypes.join(',')}\treq=${JSON.stringify(v.requirements ?? {})}`,
        );
    } else {
      for (const s of r.snippets)
        console.log(
          `${s.file}\t${s.name_en ?? s.name ?? ''}\t${(s.parameters ?? [])
            .map((p) => `${p.name}(${p.type}${p.min !== undefined ? `:${p.min}..${p.max}` : ''})`)
            .join(
              ' ',
            )}\tauto=${s.contentSummary?.automations ?? 0} scripts=${s.contentSummary?.scripts ?? 0}\tmatch=${s.discovery ? JSON.stringify(s.discovery.match) : '-'}`,
        );
    }
    console.log(`# source=${r.source}${r.generatedAt ? ` generated=${r.generatedAt}` : ''}`);
    break;
  }
  case 'gallery-show': {
    if (!a[0]) usage('h2m.mjs gallery-show <vendor/file.yaml>');
    const r = await req('GET', `/gallery/snippet${q({ file: a[0] })}`);
    process.stdout.write(r.yaml);
    console.log(`# source=${r.source} bytes=${r.bytes}`);
    break;
  }
  case 'gallery-match': {
    // h2m.mjs gallery-match <portId|-> [vendor] — 관측 패킷으로 스니펫 채점(채널 수 추정)
    const portId = a[0] === '-' ? undefined : a[0];
    const r = await req('GET', `/gallery/match${q({ portId, vendor: a[1] })}`);
    if (!r.available) {
      console.log(`UNAVAILABLE: ${r.reason}`);
      break;
    }
    console.log(`# source=${r.source} packets=${r.packetCount} evaluated=${r.evaluatedCount}`);
    for (const m of r.results ?? [])
      if (m.matched)
        console.log(
          `HIT ${m.file} n=${m.matchedPacketCount} params=${JSON.stringify(m.parameterValues)}`,
        );
    break;
  }
  case 'gallery-expand': {
    // h2m.mjs gallery-expand <vendor/file.yaml> [paramsJson|-] [--out draft.json] [--port portId]
    if (!a[0])
      usage(
        'h2m.mjs gallery-expand <vendor/file.yaml> [paramsJson] [--out draft.json] [--port portId]',
      );
    const outIndex = a.indexOf('--out');
    const portIndex = a.indexOf('--port');
    const out = outIndex >= 0 ? a[outIndex + 1] : undefined;
    const portId = portIndex >= 0 ? a[portIndex + 1] : undefined;
    const parameterValues =
      a[1] && a[1] !== '-' && !a[1].startsWith('--') ? JSON.parse(a[1]) : undefined;
    const r = await req('POST', '/gallery/expand', {
      body: { file: a[0], parameterValues, portId },
    });
    console.log(
      `# source=${r.source} params=${JSON.stringify(r.parameterValues)} entities=${r.counts.entities} automations=${r.counts.automations} scripts=${r.counts.scripts}`,
    );
    if (out) {
      fs.writeFileSync(out, JSON.stringify(r.draft, null, 2));
      console.log(`draft -> ${out}`);
    } else {
      printJson(r.draft, 4000);
    }
    break;
  }
  case 'backups': {
    // h2m.mjs backups list [portId|-] | create [portId|-] [reason] [--out file.yaml] | get <filename> [outfile] | restore <filename> [--no-restart]
    const [sub] = a;
    const rest = a.slice(1).filter((v, i, arr) => !v.startsWith('--') && arr[i - 1] !== '--out');
    const [target, extra] = rest;
    const outIndex = a.indexOf('--out');
    const out = outIndex >= 0 ? a[outIndex + 1] : undefined;
    if (sub === 'list') {
      const r = await req(
        'GET',
        `/backups${q({ portId: target && target !== '-' ? target : undefined })}`,
      );
      console.log(
        `backups=${r.backups.length} totalSize=${r.totalSize}${r.configFile ? ` configFile=${r.configFile}` : ''}`,
      );
      for (const b of r.backups)
        console.log(`${b.filename}\t${b.size}B\t${b.reason}\t${b.createdAt}`);
    } else if (sub === 'create') {
      const reason = extra && !extra.startsWith('--') ? extra : undefined;
      const r = await req('POST', '/backups', {
        body: { portId: target && target !== '-' ? target : undefined, reason },
      });
      console.log(
        `created ${r.backup.filename} bytes=${r.backup.bytes} configFile=${r.backup.configFile}`,
      );
      if (out) {
        fs.writeFileSync(out, r.backup.yaml);
        console.log(`yaml -> ${out}`);
      }
    } else if (sub === 'get') {
      if (!target) usage('h2m.mjs backups get <filename> [outfile]');
      if (extra) {
        const buf = await req('GET', `/backups/${encodeURIComponent(target)}`, { raw: true });
        fs.writeFileSync(extra, buf);
        console.log(`saved -> ${extra} (${buf.length} bytes)`);
      } else {
        printJson(await req('GET', `/backups/${encodeURIComponent(target)}`), 8000);
      }
    } else if (sub === 'restore') {
      if (!target) usage('h2m.mjs backups restore <filename> [--no-restart]');
      console.log(
        '!! /backups/restore 는 설정 YAML을 백업으로 덮어쓰고 기본적으로 재시작합니다. 현재 YAML은 pre_restore 백업으로 남습니다.',
      );
      printJson(
        await req('POST', '/backups/restore', {
          body: { filename: target, confirm: true, restart: !a.includes('--no-restart') },
        }),
      );
    } else {
      usage(
        'h2m.mjs backups <list [portId|-]|create [portId|-] [reason] [--out file.yaml]|get <filename> [outfile]|restore <filename> [--no-restart]>',
      );
    }
    break;
  }
  case 'delete-bridge': {
    // h2m.mjs delete-bridge <portId|-> --backup <filename> --confirm [--config-file <file>]
    // 삭제 전에 만든 백업이 현재 YAML과 일치할 때만 서버가 삭제한다.
    const usageText =
      'h2m.mjs delete-bridge <portId|-> --backup <filename> --confirm [--config-file <file>]';
    const readFlag = (name) => {
      const i = a.findIndex((v) => v === name || v.startsWith(`${name}=`));
      if (i < 0) return undefined;
      const token = a[i];
      if (token.includes('=')) return token.slice(name.length + 1);
      const next = a[i + 1];
      if (!next || next.startsWith('--')) {
        console.error(`거부: ${name} 값이 필요합니다.`);
        process.exit(2);
      }
      return next;
    };

    for (const v of a) {
      if (!v.startsWith('--')) continue;
      const name = v.split('=')[0];
      if (!['--backup', '--confirm', '--config-file'].includes(name)) usage(usageText);
      if (name === '--confirm' && v.includes('=')) {
        console.error('거부: --confirm 은 값 없이 단독으로 사용하세요.');
        process.exit(2);
      }
    }

    if (!a.includes('--confirm')) {
      console.error(
        '거부: 브릿지 YAML 삭제에는 --confirm 이 필요합니다. 대상·백업 파일·재시작 영향을 사용자에게 알리고 승인을 받으세요.',
      );
      process.exit(2);
    }
    const backup = readFlag('--backup');
    if (!backup) {
      console.error(
        '거부: 삭제 전에 backups create로 현재 YAML을 백업하고 --backup <filename>으로 지정해야 합니다.',
      );
      process.exit(2);
    }
    const configFile = readFlag('--config-file');
    const portId = a[0] && !a[0].startsWith('--') && a[0] !== '-' ? a[0] : undefined;
    console.log('!! /bridges/delete: YAML을 삭제하고 서비스를 재시작합니다.');
    printJson(
      await req('POST', '/bridges/delete', {
        body: { portId, configFile, backupFilename: backup, confirm: true },
      }),
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
    if (r.counts)
      console.log(
        `counts entities=${r.counts.entities} automations=${r.counts.automations} scripts=${r.counts.scripts}`,
      );
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
    if (!a[1]) usage('h2m.mjs preview <portId> <hex> [--header] [--footer] [--no-checksum]');
    printJson(
      await req('POST', '/packets/preview', {
        body: {
          portId: a[0],
          hex: a[1].replace(/\s/g, ''),
          header: a.includes('--header'),
          footer: a.includes('--footer'),
          checksum: !a.includes('--no-checksum'),
        },
      }),
    );
    break;
  }
  case 'send': {
    // h2m.mjs send <portId> <hex> [<hex> ...] --confirm [--header] [--footer] [--no-checksum]
    //   [--count N --interval ms] | [--delay ms]
    // 실제 버스 전송. 단일 hex는 count 반복, 여러 hex는 승인된 순서대로 1회씩 보낸다.
    const sendUsage =
      'h2m.mjs send <portId> <hex> [<hex> ...] --confirm [--header] [--footer] [--no-checksum] [--count N --interval ms] [--delay ms]';
    const booleanFlags = new Set(['--confirm', '--header', '--footer', '--no-checksum']);
    const valueFlags = new Set(['--delay', '--count', '--interval']);

    for (const v of a) {
      if (!v.startsWith('--')) continue;
      const name = v.split('=')[0];
      if (booleanFlags.has(name) && v.includes('=')) {
        console.error(`거부: ${name} 은 값 없이 단독으로 사용하세요.`);
        process.exit(2);
      }
      if (!booleanFlags.has(name) && !valueFlags.has(name)) usage(sendUsage);
    }

    const flagValue = (name) => {
      const i = a.findIndex((v) => v === name || v.startsWith(`${name}=`));
      if (i < 0) return undefined;
      const token = a[i];
      if (token.includes('=')) return token.slice(name.length + 1);
      if (i + 1 >= a.length || a[i + 1].startsWith('--')) {
        console.error(`거부: ${name} 값이 필요합니다.`);
        process.exit(2);
      }
      return a[i + 1];
    };

    const readInt = (name, fallback) => {
      const raw = flagValue(name);
      if (raw === undefined) return fallback;
      const value = Number(raw);
      if (!Number.isInteger(value)) {
        console.error(`거부: ${name} 값은 정수여야 합니다.`);
        process.exit(2);
      }
      return value;
    };

    const hexArgs = [];
    for (let i = 1; i < a.length; i += 1) {
      const v = a[i];
      if (v.startsWith('--')) {
        if (valueFlags.has(v.split('=')[0]) && !v.includes('=')) i += 1;
        continue;
      }
      hexArgs.push(v.replace(/\s/g, ''));
    }

    if (!hexArgs.length) usage(sendUsage);
    if (!a.includes('--confirm')) {
      console.error(
        '거부: 실제 RS485 버스 전송에는 --confirm 이 필요합니다. 먼저 preview로 최종 hex를 확인하고, 대상 기기·순서·간격과 함께 사용자 승인을 받으세요.',
      );
      process.exit(2);
    }
    if (hexArgs.some((hex) => !/^[0-9A-Fa-f]+$/.test(hex) || hex.length % 2 !== 0)) {
      console.error('거부: hex는 공백을 제외한 짝수 길이의 16진수여야 합니다.');
      process.exit(2);
    }
    if (hexArgs.length > 10) {
      console.error(
        '거부: 한 번에 최대 10개 패킷까지 전송할 수 있습니다. 더 긴 계획은 나눠서 호출하세요.',
      );
      process.exit(2);
    }

    const count = readInt('--count', 1);
    const interval = readInt('--interval', 100);
    const delay = readInt('--delay', 1000);
    if (count < 1 || count > 10) {
      console.error('거부: --count 는 1~10이어야 합니다.');
      process.exit(2);
    }
    if (interval < 10 || interval > 1000) {
      console.error('거부: --interval 은 10~1000ms여야 합니다.');
      process.exit(2);
    }
    if (delay < 0 || delay > 60000) {
      console.error('거부: --delay 는 0~60000ms여야 합니다.');
      process.exit(2);
    }
    if (hexArgs.length > 1 && count !== 1) {
      console.error(
        '거부: 여러 hex 시퀀스에서는 --count를 쓸 수 없습니다. 같은 패킷 반복은 hex 하나와 --count를 쓰세요.',
      );
      process.exit(2);
    }
    if (hexArgs.length === 1 && flagValue('--delay') !== undefined) {
      console.error('거부: 단일 hex 반복 간격은 --delay가 아니라 --interval입니다.');
      process.exit(2);
    }

    const common = {
      portId: a[0],
      header: a.includes('--header'),
      footer: a.includes('--footer'),
      checksum: !a.includes('--no-checksum'),
      confirm: true,
    };

    if (hexArgs.length === 1) {
      console.log(`!! /packets/send: 실제 RS485 버스로 ${count}회 전송합니다.`);
      printJson(
        await req('POST', '/packets/send', {
          body: { ...common, hex: hexArgs[0], count, interval },
        }),
      );
      break;
    }

    console.log(
      `!! /packets/send: 실제 RS485 버스로 ${hexArgs.length}개 패킷을 ${delay}ms 간격으로 승인된 순서대로 전송합니다.`,
    );
    const results = [];
    for (let i = 0; i < hexArgs.length; i += 1) {
      console.log(`[${i + 1}/${hexArgs.length}] send ${hexArgs[i]}`);
      const result = await req('POST', '/packets/send', {
        body: { ...common, hex: hexArgs[i], count: 1, interval },
      });
      results.push({
        index: i + 1,
        hex: hexArgs[i],
        packet: result.packet,
        sentCount: result.sentCount,
      });
      if (i < hexArgs.length - 1 && delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    printJson({ success: true, portId: a[0], sentCount: results.length, packets: results });
    break;
  }
  default:
    usage(
      'info|setup|get|post|entities|automations|scripts|unmatched|history|capture|gallery|gallery-show|gallery-match|gallery-expand|backups|delete-bridge|analyze|validate|apply|preview|send',
    );
}
