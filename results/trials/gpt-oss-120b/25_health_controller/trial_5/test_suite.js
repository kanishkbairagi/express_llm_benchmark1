import { jest } from '@jest/globals';
import {
  getLiveness,
  getReadiness,
  SystemHealth
} from '../dataset/25_health_controller.js';

describe('Health Controller', () => {
  const createResMock = () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    return res;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getLiveness', () => {
    it('should respond with 200 and UP status', async () => {
      const res = createResMock();

      await getLiveness({}, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.status).toBe('UP');
      expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
      expect(typeof payload.uptimeSeconds).toBe('number');
      expect(payload.uptimeSeconds).toBeLessThanOrEqual(Math.floor(process.uptime()));
    });

    it('should handle unexpected errors and respond with 500', async () => {
      const res = createResMock();
      // Force an error inside the try block
      res.status.mockImplementation(() => {
        throw new Error('boom');
      });

      await getLiveness({}, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const payload = res.json.mock.calls[0][0];
      expect(payload.status).toBe('DOWN');
      expect(payload.error).toBe('boom');
    });
  });

  describe('getReadiness', () => {
    it('should return 200 UP when all checks are healthy and memory is normal', async () => {
      const res = createResMock();

      // Mock healthy dependencies
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 5 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 2 });

      // Mock memory usage below threshold
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: 500 * 1024 * 1024, // 500 MB
        rss: 800 * 1024 * 1024,
        heapTotal: 0,
        external: 0,
        arrayBuffers: 0
      });

      await getReadiness({}, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.status).toBe('UP');
      expect(payload.checks.database.status).toBe('UP');
      expect(payload.checks.redis.status).toBe('UP');
      expect(payload.checks.memory.status).toBe('UP');
    });

    it('should return 503 DOWN when database check fails', async () => {
      const res = createResMock();

      // Database throws error
      jest.spyOn(SystemHealth, 'pingDatabase').mockRejectedValue(new Error('db down'));
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 2 });

      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: 400 * 1024 * 1024,
        rss: 600 * 1024 * 1024,
        heapTotal: 0,
        external: 0,
        arrayBuffers: 0
      });

      await getReadiness({}, res);

      expect(res.status).toHaveBeenCalledWith(503);
      const payload = res.json.mock.calls[0][0];
      expect(payload.status).toBe('DOWN');
      expect(payload.checks.database.status).toBe('DOWN');
      expect(payload.checks.database.error).toBe('db down');
      expect(payload.checks.redis.status).toBe('UP');
    });

    it('should return 503 DOWN when redis check reports non‑UP status', async () => {
      const res = createResMock();

      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 5 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'DOWN', latencyMs: 0, error: 'unreachable' });

      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: 300 * 1024 * 1024,
        rss: 500 * 1024 * 1024,
        heapTotal: 0,
        external: 0,
        arrayBuffers: 0
      });

      await getReadiness({}, res);

      expect(res.status).toHaveBeenCalledWith(503);
      const payload = res.json.mock.calls[0][0];
      expect(payload.status).toBe('DOWN');
      expect(payload.checks.redis.status).toBe('DOWN');
      expect(payload.checks.redis.error).toBe('unreachable');
    });

    it('should flag memory WARN when heapUsed exceeds 1.5 GB but still return UP if other checks pass', async () => {
      const res = createResMock();

      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 3 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });

      // Simulate high memory usage (2 GB)
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: 2 * 1024 * 1024 * 1024, // 2 GB
        rss: 3 * 1024 * 1024 * 1024,
        heapTotal: 0,
        external: 0,
        arrayBuffers: 0
      });

      await getReadiness({}, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.status).toBe('UP');
      expect(payload.checks.memory.status).toBe('WARN');
      expect(payload.checks.memory.heapUsedMb).toBeGreaterThan(1500);
    });

    it('should return 500 when an unexpected error occurs during readiness', async () => {
      const res = createResMock();

      // Force outer try/catch by making memoryUsage throw
      jest.spyOn(process, 'memoryUsage').mockImplementation(() => {
        throw new Error('memory probe failed');
      });

      // Dependencies are healthy
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 3 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });

      await getReadiness({}, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const payload = res.json.mock.calls[0][0];
      expect(payload.status).toBe('DOWN');
      expect(payload.error).toBe('Failed to execute readiness checks');
      expect(payload.details).toBe('memory probe failed');
    });
  });
});