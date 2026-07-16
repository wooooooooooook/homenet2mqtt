#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// CLI Arguments
const args = process.argv.slice(2);
const targetIdx = args.indexOf('--target');
const versionIdx = args.indexOf('--version');
const typesIdx = args.indexOf('--types');

if (targetIdx === -1) {
  console.error('Usage: node generate-addons.mjs --target <target_directory> [--version <version>] [--types <types_comma_separated>]');
  process.exit(1);
}

const targetDir = path.resolve(args[targetIdx + 1]);
const version = versionIdx !== -1 ? args[versionIdx + 1] : null;
const typesStr = typesIdx !== -1 ? args[typesIdx + 1] : 'mqtt,matter'; // 기본값은 릴리즈용 2개
const targetTypes = typesStr.split(',').map(t => t.trim().toLowerCase());

const sourceAddonDir = path.join(rootDir, 'hassio-addon');

if (!fs.existsSync(sourceAddonDir)) {
  console.error(`Source addon directory not found: ${sourceAddonDir}`);
  process.exit(1);
}

// Helper: Directory Copy
function copyDirSync(src, dest, isDevAddon) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // config-matter.yaml, logo-dev.png, logo.png, logos, README-*.md 는 개별 처리되거나 제외되므로 그대로 복사하지 않음
    if (
      entry.name === 'config-matter.yaml' ||
      entry.name === 'logo-dev.png' ||
      entry.name === 'logo.png' ||
      entry.name === 'logos' ||
      /^README-.+\.md$/.test(entry.name)
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath, isDevAddon);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Helper: YAML Configuration Update
function updateConfig(filePath, updates) {
  const content = fs.readFileSync(filePath, 'utf8');
  const config = yaml.load(content);

  // Apply updates (including nesting for 'options')
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      config[key] = { ...config[key], ...value };
    } else {
      config[key] = value;
    }
  }

  const newContent = yaml.dump(config, {
    lineWidth: -1,
    quotingType: '"',
  });
  fs.writeFileSync(filePath, newContent, 'utf8');
}

// Main execution
function main() {
  console.log(`Generating addons to: ${targetDir}`);
  console.log(`Target types: ${targetTypes.join(', ')}`);
  if (version) {
    console.log(`Setting version to: ${version}`);
  }

  const addonsConfig = {
    'mqtt': {
      folderName: 'Homenet2MQTT',
      isDev: false,
      isMatter: false,
      readme: null, // 기본 README.md 사용
      logo: 'logos/logo_mqtt.png',
      updates: {}
    },
    'matter': {
      folderName: 'Homenet2Matter',
      isDev: false,
      isMatter: true,
      readme: 'README-matter.md',
      logo: 'logos/logo_matter.png',
      updates: {}
    },
    'mqtt-dev': {
      folderName: 'Homenet2MQTT-dev',
      isDev: true,
      isMatter: false,
      readme: 'README-mqtt-dev.md',
      logo: 'logos/logo_mqtt_dev.png',
      updates: {
        name: 'Homenet2MQTT (Dev)',
        slug: 'h2m-dev',
        description: 'Bridge between RS485 HomeNet devices and MQTT (supports multi-port/topic mapping) [Development Version].'
      }
    },
    'matter-dev': {
      folderName: 'Homenet2Matter-dev',
      isDev: true,
      isMatter: true,
      readme: 'README-matter-dev.md',
      logo: 'logos/logo_matter_dev.png',
      updates: {
        name: 'Homenet2Matter (Dev)',
        slug: 'h2m-matter-dev',
        description: 'Bridge between RS485 HomeNet devices and Matter (supports multi-port mapping) [Development Version].'
      }
    }
  };

  for (const type of targetTypes) {
    const configData = addonsConfig[type];
    if (!configData) {
      console.warn(`Warning: Unknown addon type '${type}'. Skipping.`);
      continue;
    }

    const destPath = path.join(targetDir, configData.folderName);
    console.log(`- Generating '${type}' -> ${destPath}`);

    if (fs.existsSync(destPath)) {
      fs.rmSync(destPath, { recursive: true, force: true });
    }

    copyDirSync(sourceAddonDir, destPath, configData.isDev);

    const configDestPath = path.join(destPath, 'config.yaml');

    if (configData.isMatter) {
      // Matter 계열 애드온은 소스의 config-matter.yaml을 복사하여 덮어씀
      const sourceMatterConfig = path.join(sourceAddonDir, 'config-matter.yaml');
      if (fs.existsSync(sourceMatterConfig)) {
        fs.copyFileSync(sourceMatterConfig, configDestPath);
      } else {
        console.error(`Error: Source config-matter.yaml not found!`);
        process.exit(1);
      }
    }

    const updates = { ...configData.updates };
    if (version) {
      updates.version = version;
    }

    // config.yaml 업데이트 적용 (이름, 슬러그, 버전, 설명 등)
    updateConfig(configDestPath, updates);

    // 타입별 README 교체
    if (configData.readme) {
      const srcReadme = path.join(sourceAddonDir, configData.readme);
      const destReadme = path.join(destPath, 'README.md');
      if (fs.existsSync(srcReadme)) {
        fs.copyFileSync(srcReadme, destReadme);
        console.log(`  README: ${configData.readme} -> README.md`);
      } else {
        console.warn(`  Warning: ${configData.readme} not found, keeping original README.md`);
      }
    }

    // 타입별 로고 교체 (Home Assistant 애드온 로고는 logo.png로 통일 필요)
    if (configData.logo) {
      const srcLogo = path.join(sourceAddonDir, configData.logo);
      const destLogo = path.join(destPath, 'logo.png');
      const destIcon = path.join(destPath, 'icon.png');
      if (fs.existsSync(srcLogo)) {
        fs.copyFileSync(srcLogo, destLogo);
        fs.copyFileSync(srcLogo, destIcon);
        console.log(`  Logo: ${configData.logo} -> logo.png & icon.png`);
      } else {
        console.warn(`  Warning: ${configData.logo} not found!`);
      }
    }
  }

  console.log('Done generating addons!');
}

main();
