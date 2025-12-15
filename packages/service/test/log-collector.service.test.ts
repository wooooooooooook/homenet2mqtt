import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

const mocks = vi.hoisted(() => {
  return {
    eventBus: {
      on: vi.fn(),
      emit: vi.fn(),
      off: vi.fn(),
    },
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
    logBuffer: {
      getLogs: vi.fn().mockReturnValue([]),
    },
    HomeNetBridge: vi.fn(),
  };
});

vi.mock('@rs485-homenet/core', () => ({
  eventBus: mocks.eventBus,
  logger: mocks.logger,
  logBuffer: mocks.logBuffer,
  HomeNetBridge: mocks.HomeNetBridge,
}));

// Mock fs to avoid file system writes
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('LogCollectorService Security', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    fetchMock.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('OK'),
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use environment variables for API Key and URL', async () => {
    process.env.LOG_COLLECTOR_API_KEY = 'env-api-key';
    process.env.LOG_COLLECTOR_URL = 'https://env-url.com/';

    // Dynamic import to pick up new env vars
    const { logCollectorService } = await import('../src/log-collector.service.js');

    await logCollectorService.sendData();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://env-url.com/',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'env-api-key',
        }),
      }),
    );
  });

  it('should fallback to default if env vars are missing', async () => {
    delete process.env.LOG_COLLECTOR_API_KEY;
    delete process.env.LOG_COLLECTOR_URL;

    const { logCollectorService } = await import('../src/log-collector.service.js');

    await logCollectorService.sendData();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://h2m-log-collector.nubiz.workers.dev/',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'h2m-log-collector-is-cool',
        }),
      }),
    );
  });

  it('should warn when using default API key', async () => {
    delete process.env.LOG_COLLECTOR_API_KEY;
    const { logCollectorService } = await import('../src/log-collector.service.js');

    await logCollectorService.init([]);
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Using insecure default API key'),
    );
  });
});
