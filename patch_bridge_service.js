const fs = require('fs');
const path = require('path');

const targetPath = path.resolve('packages/core/src/service/bridge.service.ts');
let content = fs.readFileSync(targetPath, 'utf8');

const targetStr = `  private findEntityConfig(
    entityId: string,
  ): { type: keyof HomenetBridgeConfig; entity: EntityConfig } | undefined {
    for (const type of ENTITY_TYPE_KEYS) {
      const entities = this.config?.[type];
      if (!entities) continue;

      const entity = (entities as EntityConfig[]).find((e) => e.id === entityId);
      if (entity) {
        return { type, entity };
      }
    }
    return undefined;
  }`;

if (!content.includes(targetStr)) {
  console.error("Could not find findEntityConfig in bridge.service.ts");
  process.exit(1);
}
content = content.replace(targetStr, "");

const renameTargetStr = `    const entityEntry = this.findEntityConfig(entityId);

    if (!entityEntry) {`;

const renameNewStr = `    const entityEntry = findEntityById(this.config, entityId);

    if (!entityEntry) {`;

if (!content.includes(renameTargetStr)) {
  console.error("Could not find renameTargetStr in bridge.service.ts");
  process.exit(1);
}
content = content.replace(renameTargetStr, renameNewStr);

const renameTargetStr2 = `    const { entity } = entityEntry;`;
const renameNewStr2 = `    const entity = entityEntry;`;

if (!content.includes(renameTargetStr2)) {
  console.error("Could not find renameTargetStr2 in bridge.service.ts");
  process.exit(1);
}
content = content.replace(renameTargetStr2, renameNewStr2);


fs.writeFileSync(targetPath, content, 'utf8');
console.log("Successfully patched bridge.service.ts");
