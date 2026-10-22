/**
 * Config Routes - handles configuration updates (Editor)
 */

import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import yaml from 'js-yaml';
import { logger, normalizeConfig } from '@rs485-homenet/core';
import { dumpConfigToYaml } from '../utils/yaml-dumper.js';
import type { HomenetBridgeConfig } from '@rs485-homenet/core';
import type { AutomationConfig, ScriptConfig } from '@rs485-homenet/core/config/types';
import { ENTITY_TYPE_KEYS } from '../utils/constants.js';
import type { RateLimiter } from '../utils/rate-limiter.js';
import type { BridgeInstance, PersistableHomenetBridgeConfig } from '../types/index.js';
import { saveBackup } from '../services/backup.service.js';
import {
  addConfigItems,
  ConfigItemsError,
  withConfigWriteLock,
} from '../services/config-items.service.js';
import { buildDiscoveryPreviews } from '../services/discovery-preview.service.js';
import { resolveSecurePath } from '../utils/helpers.js';

import {
  findConfigIndexByPortId,
  findConfigIndexForEntity,
  findConfigIndexForAutomation,
  findConfigIndexForScript,
} from '../utils/config-helpers.js';

export interface ConfigRoutesContext {
  configRateLimiter: RateLimiter;
  getBridges: () => BridgeInstance[];
  getCurrentConfigs: () => HomenetBridgeConfig[];
  getCurrentConfigFiles: () => string[];
  getCurrentRawConfigs: () => HomenetBridgeConfig[];

  configDir: string;
  setCurrentConfigs: (index: number, config: HomenetBridgeConfig) => void;
  setCurrentRawConfigs: (index: number, config: HomenetBridgeConfig) => void;
  rebuildPortMappings: () => void;
}

export function createConfigRoutes(ctx: ConfigRoutesContext): Router {
  const router = Router();

  // Cache entity indexes to optimize O(N*M) lookups down to O(1)
  const configEntityIndexes = new WeakMap<object, Map<string, any>>();
  const configAutomationIndexes = new WeakMap<object, Map<string, any>>();
  const configScriptIndexes = new WeakMap<object, Map<string, any>>();

  // --- Helper Functions ---
  // Moved to utils/config-helpers.ts

  // --- API Routes ---

  router.get('/api/config/raw/:type/:entityId', (req, res) => {
    const currentRawConfigs = ctx.getCurrentRawConfigs();
    if (currentRawConfigs.length === 0) {
      return res.status(400).json({ error: 'Config not loaded' });
    }

    const { type, entityId } = req.params;
    let foundEntity: any = null;

    if (type === 'entity') {
      for (const rawConfig of currentRawConfigs) {
        let index = configEntityIndexes.get(rawConfig);
        if (!index) {
          index = new Map<string, any>();
          for (const entityType of ENTITY_TYPE_KEYS) {
            const entities = rawConfig[entityType] as Array<any> | undefined;
            if (Array.isArray(entities)) {
              for (const e of entities) {
                if (e && e.id) index.set(e.id, e);
              }
            }
          }
          configEntityIndexes.set(rawConfig, index);
        }
        foundEntity = index.get(entityId);
        if (foundEntity) break;
      }
    } else if (type === 'automation') {
      for (const rawConfig of currentRawConfigs) {
        let index = configAutomationIndexes.get(rawConfig);
        if (!index) {
          index = new Map<string, any>();
          const automations = rawConfig.automation as Array<any> | undefined;
          if (Array.isArray(automations)) {
            for (const a of automations) {
              if (a && a.id) index.set(a.id, a);
            }
          }
          configAutomationIndexes.set(rawConfig, index);
        }
        foundEntity = index.get(entityId);
        if (foundEntity) break;
      }
    } else if (type === 'script') {
      for (const rawConfig of currentRawConfigs) {
        let index = configScriptIndexes.get(rawConfig);
        if (!index) {
          index = new Map<string, any>();
          const scripts = rawConfig.scripts as Array<any> | undefined;
          if (Array.isArray(scripts)) {
            for (const s of scripts) {
              if (s && s.id) index.set(s.id, s);
            }
          }
          configScriptIndexes.set(rawConfig, index);
        }
        foundEntity = index.get(entityId);
        if (foundEntity) break;
      }
    } else {
      return res.status(400).json({ error: 'Unknown config type' });
    }

    if (!foundEntity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    try {
      const yamlString = dumpConfigToYaml(foundEntity);
      res.json({ yaml: yamlString });
    } catch (err) {
      logger.error({ err }, '[service] Failed to dump config to YAML');
      res.status(500).json({ error: 'Failed to generate YAML' });
    }
  });

  router.post('/api/config/update', async (req, res) => {
    if (!ctx.configRateLimiter.check(req.ip || 'unknown')) {
      logger.warn({ ip: req.ip }, '[service] Config update rate limit exceeded');
      return res.status(429).json({ error: 'Too many requests' });
    }

    const {
      entityId,
      yaml: newEntityYaml,
      portId,
      type = 'entity',
    } = req.body as {
      entityId: string;
      yaml: string;
      portId?: string;
      type?: 'entity' | 'automation' | 'script';
    };

    if (!entityId || typeof entityId !== 'string') {
      return res.status(400).json({ error: 'entityId가 필요합니다.' });
    }

    // Find config by portId if provided, otherwise fallback to finding by entityId
    let configIndex = -1;
    const currentConfigs = ctx.getCurrentConfigs();

    if (type === 'entity') {
      configIndex = portId
        ? findConfigIndexByPortId(currentConfigs, portId)
        : findConfigIndexForEntity(currentConfigs, entityId);
    } else if (type === 'automation') {
      configIndex = findConfigIndexForAutomation(currentConfigs, entityId);
    } else if (type === 'script') {
      configIndex = findConfigIndexForScript(currentConfigs, entityId);
    } else {
      return res.status(400).json({ error: 'Unknown config type' });
    }
    if (configIndex === -1) {
      return res.status(404).json({ error: 'Entity not found in any loaded config' });
    }

    const currentConfigFiles = ctx.getCurrentConfigFiles();
    const targetConfigFile = currentConfigFiles[configIndex];

    try {
      // 1. Parse new YAML snippet
      let newEntity: any;
      try {
        newEntity = yaml.load(newEntityYaml);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid YAML format' });
      }

      if (!newEntity || typeof newEntity !== 'object') {
        return res.status(400).json({ error: 'Invalid YAML content' });
      }

      if (
        (type === 'automation' || type === 'script') &&
        (!newEntity.id || typeof newEntity.id !== 'string')
      ) {
        return res.status(400).json({ error: 'ID가 필요합니다.' });
      }

      // Ensure ID matches or at least exists
      if (newEntity.id && newEntity.id !== entityId) {
        // Warning: ID changed.
        logger.warn(
          `[service] Entity ID changed from ${entityId} to ${newEntity.id} during update`,
        );
      }

      // 2. Read full config
      const configPath = resolveSecurePath(ctx.configDir, targetConfigFile);
      if (!configPath) {
        return res.status(404).json({ error: 'Config file not found' });
      }
      const fileContent = await fs.readFile(configPath, 'utf8');
      const loadedYamlFromFile = yaml.load(fileContent) as {
        homenet_bridge: PersistableHomenetBridgeConfig;
      };

      if (!loadedYamlFromFile.homenet_bridge) {
        throw new Error('Invalid config file structure');
      }

      // Normalize the loaded config to ensure IDs are present
      const normalizedFullConfig = normalizeConfig(
        loadedYamlFromFile.homenet_bridge as HomenetBridgeConfig,
      );

      const backupPath = await saveBackup(configPath, loadedYamlFromFile, `${type}_update`);

      if (type === 'entity') {
        // 3. Find and update entity
        let found = false;
        for (const entityType of ENTITY_TYPE_KEYS) {
          const list = normalizedFullConfig[entityType] as any[]; // Use normalizedFullConfig here
          if (Array.isArray(list)) {
            const index = list.findIndex((e) => e.id === entityId);
            if (index !== -1) {
              list[index] = newEntity;
              found = true;
              break;
            }
          }
        }

        if (!found) {
          return res.status(404).json({ error: 'Entity not found in current config' });
        }
      } else if (type === 'automation') {
        const list = normalizedFullConfig.automation as any[] | undefined;
        if (!Array.isArray(list)) {
          return res.status(404).json({ error: 'Automation not found in current config' });
        }
        const index = list.findIndex((automation) => automation.id === entityId);
        if (index === -1) {
          return res.status(404).json({ error: 'Automation not found in current config' });
        }
        list[index] = newEntity;
      } else if (type === 'script') {
        const list = normalizedFullConfig.scripts as any[] | undefined;
        if (!Array.isArray(list)) {
          return res.status(404).json({ error: 'Script not found in current config' });
        }
        const index = list.findIndex((script) => script.id === entityId);
        if (index === -1) {
          return res.status(404).json({ error: 'Script not found in current config' });
        }
        list[index] = newEntity;
      }

      // 4. Update the original object structure with the modified data
      loadedYamlFromFile.homenet_bridge = normalizedFullConfig;

      // 5. Write new config
      const newFileContent = dumpConfigToYaml(loadedYamlFromFile);

      await fs.writeFile(configPath, newFileContent, 'utf8');

      // 6. Update in-memory raw config
      ctx.setCurrentRawConfigs(configIndex, normalizedFullConfig);
      ctx.setCurrentConfigs(configIndex, normalizedFullConfig);
      ctx.rebuildPortMappings();

      const bridges = ctx.getBridges();
      const targetBridge = bridges.find((instance) => instance.configFile === targetConfigFile);

      if (type === 'automation' && targetBridge) {
        const updatedAutomation = newEntity as AutomationConfig;
        if (updatedAutomation.id && updatedAutomation.id !== entityId) {
          targetBridge.bridge.removeAutomation(entityId);
        }
        if (updatedAutomation.enabled === false) {
          targetBridge.bridge.removeAutomation(updatedAutomation.id ?? entityId);
        } else {
          targetBridge.bridge.upsertAutomation(updatedAutomation);
        }
      }

      if (type === 'script' && targetBridge) {
        const updatedScript = newEntity as ScriptConfig;
        if (updatedScript.id && updatedScript.id !== entityId) {
          targetBridge.bridge.removeScript(entityId);
        }
        if (updatedScript.id) {
          targetBridge.bridge.upsertScript(updatedScript);
        }
      }

      logger.info(
        `[service] Config updated for ${type} ${entityId}. Backup created at ${path.basename(
          backupPath,
        )}`,
      );
      res.json({ success: true, backup: path.basename(backupPath) });
    } catch (err) {
      logger.error({ err }, '[service] Failed to update config');
      res.status(500).json({ error: err instanceof Error ? err.message : 'Update failed' });
    }
  });

  router.post('/api/config/add', async (req, res) => {
    if (!ctx.configRateLimiter.check(req.ip || 'unknown')) {
      logger.warn({ ip: req.ip }, '[service] Config add rate limit exceeded');
      return res.status(429).json({ error: 'Too many requests' });
    }

    const { portId, yaml: newYaml } = req.body as {
      portId: string;
      yaml: string;
    };

    if (!portId || typeof portId !== 'string') {
      return res.status(400).json({ error: 'portId is required' });
    }
    if (!newYaml || typeof newYaml !== 'string') {
      return res.status(400).json({ error: 'yaml is required' });
    }

    const configIndex = findConfigIndexByPortId(ctx.getCurrentConfigs(), portId);
    if (configIndex === -1) {
      return res.status(404).json({ error: 'Config not found for the given portId' });
    }

    const targetConfigFile = ctx.getCurrentConfigFiles()[configIndex];

    try {
      const result = await withConfigWriteLock(targetConfigFile, () =>
        addConfigItems({
          configDir: ctx.configDir,
          configFile: targetConfigFile,
          yaml: newYaml,
          reason: 'add_item',
        }),
      );

      ctx.setCurrentRawConfigs(configIndex, result.config);
      ctx.setCurrentConfigs(configIndex, result.config);
      ctx.rebuildPortMappings();

      logger.info(
        `[service] Config added items for ${result.mergedKeys.join(', ')} in ${portId}. Backup: ${result.backup}`,
      );

      res.json({ success: true, backup: result.backup, restartRequired: true });
    } catch (err) {
      if (err instanceof ConfigItemsError) {
        return res.status(err.status).json({ error: err.message });
      }
      logger.error({ err }, '[service] Failed to add config items');
      res.status(500).json({ error: err instanceof Error ? err.message : 'Add failed' });
    }
  });

  router.post('/api/config/discovery-preview', async (req, res) => {
    const {
      portId,
      entityType,
      yaml: entityYaml,
    } = req.body as {
      portId?: string;
      entityType?: string;
      yaml?: string;
    };

    if (!portId || typeof portId !== 'string') {
      return res.status(400).json({ error: 'portId is required' });
    }
    if (!entityType || !ENTITY_TYPE_KEYS.includes(entityType as keyof HomenetBridgeConfig)) {
      return res.status(400).json({ error: 'valid entityType is required' });
    }
    if (!entityYaml || typeof entityYaml !== 'string') {
      return res.status(400).json({ error: 'yaml is required' });
    }

    let parsedEntity: Record<string, unknown> | null = null;
    try {
      const loadedEntity = yaml.load(entityYaml);
      if (!loadedEntity || typeof loadedEntity !== 'object' || Array.isArray(loadedEntity)) {
        return res.status(400).json({ error: 'yaml must be a single entity object' });
      }
      parsedEntity = loadedEntity as Record<string, unknown>;
    } catch {
      return res.status(400).json({ error: 'Invalid YAML format' });
    }

    if (typeof parsedEntity.id !== 'string' || !parsedEntity.id.trim()) {
      return res.status(400).json({ error: 'entity id is required in YAML' });
    }

    try {
      const configIndex = findConfigIndexByPortId(ctx.getCurrentConfigs(), portId);
      if (configIndex === -1) {
        return res.status(404).json({ error: 'Config not found for the given portId' });
      }

      const portConfig = ctx.getCurrentConfigs()[configIndex];
      const [preview] = buildDiscoveryPreviews(portId, portConfig, [
        { entity: parsedEntity, entityType },
      ]);

      if (!preview) {
        return res.status(400).json({ error: 'Failed to generate discovery preview' });
      }

      return res.json({
        topic: preview.topic,
        payload: preview.payload,
      });
    } catch (error) {
      logger.error({ err: error }, '[service] Failed to build discovery preview');
      return res.status(500).json({ error: 'Failed to generate discovery preview' });
    }
  });

  return router;
}

export { createConfigRoutes as default };
