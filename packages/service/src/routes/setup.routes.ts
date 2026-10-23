import { Router } from 'express';
import type { Response } from 'express';
import { ConfigItemsError } from '../services/config-items.service.js';
import { type SetupWizardService, validateSerialPath } from '../services/setup.service.js';

export interface SetupRoutesContext {
  setupWizardService: SetupWizardService;
}

const sendSetupError = (
  res: Response,
  error: unknown,
  logger: SetupWizardService['deps']['logger'],
  fallbackMessage: string,
): void => {
  if (error instanceof ConfigItemsError) {
    res.status(error.status).json({
      error: error.code,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
    return;
  }

  logger.error({ err: error }, '[service] Setup request failed');
  res.status(500).json({ error: fallbackMessage });
};

export function createSetupRoutes(ctx: SetupRoutesContext): Router {
  const router = Router();
  const { setupWizardService } = ctx;
  const {
    deps: { serialTestRateLimiter, configRateLimiter, logger },
    getSetupOverview,
    getExampleSerialInfo,
    getExampleEntities,
    testSerial,
    applySetupSelection,
    checkDuplicateSerial,
  } = setupWizardService;

  router.get('/api/config/examples', async (_req, res) => {
    try {
      res.json(await getSetupOverview());
    } catch (error) {
      sendSetupError(res, error, logger, '예제 설정을 불러오지 못했습니다.');
    }
  });

  router.get('/api/config/examples/:filename/serial', async (req, res) => {
    try {
      const info = await getExampleSerialInfo(req.params.filename);
      res.json({ ok: true, ...info });
    } catch (error) {
      sendSetupError(res, error, logger, '예제 설정을 불러오지 못했습니다.');
    }
  });

  router.get('/api/config/examples/:filename/entities', async (req, res) => {
    try {
      res.json({ entities: await getExampleEntities(req.params.filename) });
    } catch (error) {
      sendSetupError(res, error, logger, '예제 설정을 불러오지 못했습니다.');
    }
  });

  router.post('/api/config/examples/test-serial', async (req, res) => {
    if (!serialTestRateLimiter.check(req.ip || 'unknown')) {
      logger.warn({ ip: req.ip }, '[service] Serial test rate limit exceeded');
      res.status(429).json({ error: 'Too many requests' });
      return;
    }

    try {
      res.json(await testSerial(req.body || {}));
    } catch (error) {
      sendSetupError(res, error, logger, 'SERIAL_TEST_FAILED');
    }
  });

  router.post('/api/config/check-duplicate-serial', async (req, res) => {
    try {
      const { serialPath, portId } = req.body || {};
      if (typeof serialPath !== 'string') {
        res.status(400).json({ error: 'SERIAL_PATH_REQUIRED' });
        return;
      }

      const serialPathValidation = validateSerialPath(serialPath);
      if (serialPathValidation) {
        res.status(400).json({ error: serialPathValidation.error });
        return;
      }

      const validation = await checkDuplicateSerial(serialPath.trim(), portId);
      if (validation) {
        res.status(400).json({ error: validation.error });
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      sendSetupError(res, error, logger, 'UNKNOWN_ERROR');
    }
  });

  router.post('/api/config/examples/select', async (req, res) => {
    if (configRateLimiter && !configRateLimiter.check(req.ip || 'unknown')) {
      logger.warn({ ip: req.ip }, '[service] Setup wizard rate limit exceeded');
      res.status(429).json({ error: 'Too many requests' });
      return;
    }

    try {
      res.json(await applySetupSelection(req.body || {}));
    } catch (error) {
      sendSetupError(res, error, logger, '설정 적용에 실패했습니다.');
    }
  });

  return router;
}
