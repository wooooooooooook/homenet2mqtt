import yaml from 'js-yaml';
import fs from 'node:fs/promises';

export async function loadYamlConfig(filePath: string): Promise<any> {
  const fileContent = await fs.readFile(filePath, 'utf8');
  // Use default schema, !lambda tag is no longer supported/needed
  return yaml.load(fileContent);
}
