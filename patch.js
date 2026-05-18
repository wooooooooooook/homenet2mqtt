import fs from 'fs';
let content = fs.readFileSync('packages/service/src/utils/runtime-env.ts', 'utf-8');
content = content.replace("import dotenv from 'dotenv';", "import dotenv from 'dotenv';\nimport { logger } from '@rs485-homenet/core';");
content = content.replace("console.warn(", "logger.warn(");
fs.writeFileSync('packages/service/src/utils/runtime-env.ts', content);
