/**
 * Schema routes - serves JSON Schema files for Monaco YAML editor autocomplete
 */

import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to core package's static/schema directory
const SCHEMA_DIR = path.resolve(__dirname, '../../../core/static/schema');

export function createSchemaRoutes(): Router {
  const router = Router();

  /**
   * GET /api/schema/:schemaName
   * Returns the requested JSON Schema file
   */
  router.get('/api/schema/:schemaName', async (req, res) => {
    const { schemaName } = req.params;

    // Validate schema name to prevent path traversal
    if (!/^[a-z0-9-]+$/.test(schemaName)) {
      return res.status(400).json({ error: 'Invalid schema name' });
    }

    const schemaPath = path.join(SCHEMA_DIR, `${schemaName}.schema.json`);

    try {
      const content = await fs.readFile(schemaPath, 'utf-8');
      const schema = JSON.parse(content);

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache'); // Disable cache for development
      res.json(schema);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return res.status(404).json({ error: 'Schema not found' });
      }
      console.error('[schema.routes] Error loading schema:', err);
      return res.status(500).json({ error: 'Failed to load schema' });
    }
  });

  /**
   * GET /api/schema
   * Lists available schemas
   */
  router.get('/api/schema', async (_req, res) => {
    try {
      const files = await fs.readdir(SCHEMA_DIR);
      const schemas = files
        .filter((f) => f.endsWith('.schema.json'))
        .map((f) => f.replace('.schema.json', ''));

      res.json({ schemas });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return res.json({ schemas: [] });
      }
      console.error('[schema.routes] Error listing schemas:', err);
      return res.status(500).json({ error: 'Failed to list schemas' });
    }
  });

  return router;
}
