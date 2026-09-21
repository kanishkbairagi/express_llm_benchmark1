import { jest } from '@jest/globals';
import {
  getLiveness,
  getReadiness,
  SystemHealth
} from '../dataset/25_health_controller.js';

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Health Controller', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getLiveness', () => {
    test('returns 200 with UP status and required fields', async () => {
      const req = {};
      const res = mockResponse();

      await getLiveness(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload).toMatchObject({
        status: 'UP'
      });
      expect(payload).toHaveProperty('timestamp');
      expect(payload).toHaveProperty('uptimeSeconds');
    });

    test('handles unexpected error and returns 500', async () => {
      const req = {};
      const res = {
        status: jest.fn(() => {
          throw new Error('boom');
        })
      };

      await getLiveness(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getReadiness', () => {
    const originalUptime = process.uptime;
    const originalMemory = process.memoryUsage;

    afterEach(() => {
      process.uptime = originalUptime;
      process.memoryUsage = originalMemory;
    });

    test('all checks healthy returns 200 UP', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 2 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });

      process.uptime = jest.fn(() => 42);
      process.memoryUsage = jest.fn(() => ({
        heapUsed: 500 * 1024 * 1024, // 500 MB
        rss: 800 * 1024 * 1024
      }));

      const req = {};
      const res = mockResponse();

      await getReadiness(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.status).toBe('UP');
      expect(payload.checks.database).toEqual({ status: 'UP', latencyMs: 2 });
      expect(payload.checks.redis).toEqual({ status: 'UP', latencyMs: 1 });
      expect(payload.checks.memory.status).toBe('UP');
      expect(payload.checks.memory.heapUsedMb).toBeLessThanOrEqual(1500);
    });

    test('database check failure returns 503 DOWN', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockRejectedValue(new Error('db down'));
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });

      process.memoryUsage = jest.fn(() => ({
        heapUsed: 200 * 1024 * 1024,
        rss: 300 * 1024 * 1024
      }));

      const req = {};
      const res = mockResponse();

      await getReadiness(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      const payload = res.json.mock.calls[0][0];
      expect(payload.status).toBe('DOWN');
      expect(payload.checks.database).toMatchObject({ status: 'DOWN', error: 'db down' });
    });

    test('high memory usage flags WARN but overall status remains UP', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 2 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });

      process.memoryUsage = jest.fn(() => ({
        heapUsed: 2 * 1024 * 1024 * 1024, // 2 GB
        rss: 2.5 * 1024 * 1024 * 1024
      }));

      const req = {};
      const res = mockResponse();

      await getReadiness(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.status).toBe('UP');
      expect(payload.checks.memory.status).toBe('WARN');
      expect(payload.checks.memory.heapUsedMb).toBeGreaterThan(1500);
    });

    test('unexpected error triggers outer catch and returns 500', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 2 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });

      // Force an error inside the try block (e.g., memoryUsage throws)
      process.memoryUsage = jest.fn(() => {
        throw new Error('mem fail');
      });

      const req = {};
      const res = mockResponse();

      await getReadiness(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const payload = res.json.mock.calls[0][0];
      expect(payload.status).toBe('DOWN');
      expect(payload.error).toBe('Failed to execute readiness checks');
    });
  });
});