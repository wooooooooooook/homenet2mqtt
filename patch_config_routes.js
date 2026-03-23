const fs = require('fs');
const path = require('path');

const targetPath = path.resolve('packages/service/src/routes/config.routes.ts');
let content = fs.readFileSync(targetPath, 'utf8');

const targetStr = `      const mergedKeys: string[] = [];

      for (const key of Object.keys(newItems)) {`;

const newStr = `      const mergedKeys: string[] = [];

      // Build a Map of existing IDs to their types to optimize duplicate checking (O(1) instead of O(N*M))
      const existingIds = new Map<string, string>();
      for (const entityType of [...ENTITY_TYPE_KEYS, 'automation', 'scripts'] as const) {
        const list = normalizedFullConfig[entityType];
        if (Array.isArray(list)) {
          for (const item of list) {
            if (item && typeof item === 'object' && 'id' in item && typeof item.id === 'string') {
              existingIds.set(item.id, String(entityType));
            }
          }
        }
      }

      for (const key of Object.keys(newItems)) {`;

if (!content.includes(targetStr)) {
  console.error("Could not find targetStr to patch in config.routes.ts");
  process.exit(1);
}
content = content.replace(targetStr, newStr);


const duplicateCheckStr = `        // Check for duplicate IDs before appending
        for (const newItem of newEntries) {
          if (newItem.id) {
            const duplicate = targetList.find((existing: any) => existing.id === newItem.id);
            if (duplicate) {
              return res
                .status(409)
                .json({ error: \`ID '\${newItem.id}' already exists in \${configKey}.\` });
            }
            // Also check against global uniqueness if necessary?
            // For now, uniqueness within the list (and usually within the whole system for entities) is expected.
            // Let's at least check within the current file's relevant lists if it's an entity type

            if (ENTITY_TYPE_KEYS.includes(configKey)) {
              // Check if ID exists in OTHER entity lists in the SAME file
              for (const otherKey of ENTITY_TYPE_KEYS) {
                if (otherKey === configKey) continue;
                const otherList = normalizedFullConfig[otherKey];
                if (Array.isArray(otherList) && otherList.some((e: any) => e.id === newItem.id)) {
                  return res
                    .status(409)
                    .json({ error: \`ID '\${newItem.id}' already exists in \${String(otherKey)}.\` });
                }
              }
            }
          }
        }`;

const newDuplicateCheckStr = `        // Check for duplicate IDs before appending
        for (const newItem of newEntries) {
          if (newItem.id) {
            const existingType = existingIds.get(newItem.id);
            if (existingType) {
              return res
                .status(409)
                .json({ error: \`ID '\${newItem.id}' already exists in \${existingType}.\` });
            }
            existingIds.set(newItem.id, configKey);
          }
        }`;

if (!content.includes(duplicateCheckStr)) {
  console.error("Could not find duplicateCheckStr to patch in config.routes.ts");
  process.exit(1);
}
content = content.replace(duplicateCheckStr, newDuplicateCheckStr);

fs.writeFileSync(targetPath, content, 'utf8');
console.log("Successfully patched config.routes.ts");
