import { access, cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const uiDistDir = path.join(repoRoot, 'packages/ui/dist');
const serviceStaticDir = path.join(repoRoot, 'packages/service/static');

const exists = async (targetPath) => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const ensureUiBuildOutput = async () => {
  if (await exists(uiDistDir)) {
    return;
  }

  console.error(
    `UI 빌드 산출물이 없습니다. 먼저 'pnpm --filter @rs485-homenet/ui build'를 실행하세요.`
  );
  process.exitCode = 1;
  throw new Error('UI dist directory not found');
};

const syncUiAssets = async () => {
  await ensureUiBuildOutput();

  await rm(serviceStaticDir, { recursive: true, force: true });
  await mkdir(serviceStaticDir, { recursive: true });
  await cp(uiDistDir, serviceStaticDir, { recursive: true });
};

syncUiAssets()
  .then(() => {
    console.log('UI 정적 파일을 service/static으로 동기화했습니다.');
  })
  .catch((err) => {
    console.error('[sync-ui-static] 실패:', err);
    process.exit(1);
  });
