import { jest } from '@jest/globals';
import {
  getLiveness,
  getReadiness,
  SystemHealth
} from '../dataset/25_health_controller.js';

describe('Health Controller', () => {
  let mockRes;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('getLiveness', () => {
    it('should respond with 200 and proper payload', async () => {
      const uptimeSpy = jest.spyOn(process, 'uptime').mockReturnValue(42.7);
      await getLiveness({}, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      const payload = mockRes.json.mock.calls[0][0];
      expect(payload).toMatchObject({
        status: 'UP',
        uptimeSeconds: 42
      });
      expect(new Date(payload.timestamp).toString()).not.toBe('Invalid Date');
      uptimeSpy.mockRestore();
    });

    it('should handle unexpected errors and return 500', async () => {
      // Force an error by making res.status throw
      mockRes.status.mockImplementation(() => {
        throw new Error('boom');
      });
      await getLiveness({}, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      const payload = mockRes.json.mock.calls[0][0];
      expect(payload).toMatchObject({
        status: 'DOWN',
        error: 'boom'
      });
    });
  });

  describe('getReadiness', () => {
    const memoryMock = {
      heapUsed: 500 * 1024 * 1024, // 500 MB
      rss: 800 * 1024 * 1024 // 800 MB
    };

    beforeEach(() => {
      jest.spyOn(process, 'memoryUsage').mockReturnValue(memoryMock);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should return 200 when all checks are healthy', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 3 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });

      await getReadiness({}, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      const payload = mockRes.json.mock.calls[0][0];
      expect(payload.status).toBe('UP');
      expect(payload.checks.database).toEqual({ status: 'UP', latencyMs: 3 });
      expect(payload.checks.redis).toEqual({ status: 'UP', latencyMs: 1 });
      expect(payload.checks.memory).toMatchObject({
        status: 'UP',
        heapUsedMb: 500,
        rssMb: 800
      });
    });

    it('should return 503 when database check reports DOWN', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'DOWN', latencyMs: 5 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });

      await getReadiness({}, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      const payload = mockRes.json.mock.calls[0][0];
      expect(payload.status).toBe('DOWN');
      expect(payload.checks.database).toEqual({ status: 'DOWN', latencyMs: 5 });
      expect(payload.checks.redis).toEqual({ status: 'UP', latencyMs: 1 });
    });

    it('should handle exception from pingDatabase and mark it DOWN', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockRejectedValue(new Error('db error'));
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });

      await getReadiness({}, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      const payload = mockRes.json.mock.calls[0][0];
      expect(payload.status).toBe('DOWN');
      expect(payload.checks.database).toMatchObject({
        status: 'DOWN',
        error: 'db error'
      });
    });

    it('should handle exception from pingRedis and mark it DOWN', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 3 });
      jest.spyOn(SystemHealth, 'pingRedis').mockRejectedValue(new Error('redis fail'));

      await getReadiness({}, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      const payload = mockRes.json.mock.calls[0][0];
      expect(payload.status).toBe('DOWN');
      expect(payload.checks.redis).toMatchObject({
        status: 'DOWN',
        error: 'redis fail'
      });
    });

    it('should return WARN for memory when heapUsed exceeds 1.5GB', async () => {
      // Mock heavy memory usage
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: 2 * 1024 * 1024 * 1024, // 2 GB
        rss: 2 * 1024 * 1024 * 1024
      });
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 3 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });

      await getReadiness({}, mockRes);

      const payload = mockRes.json.mock.calls[0][0];
      expect(payload.checks.memory.status).toBe('WARN');
      expect(payload.checks.memory.heapUsedMb).toBeGreaterThan(1500);
    });

    it('should return 500 if an unexpected error occurs', async () => {
      // Force an unexpected error by mocking SystemHealth method to throw non‑caught error
      jest.spyOn(SystemHealth, 'pingDatabase').mockImplementation(() => {
        throw new Error('unexpected');
      });
      // Ensure getReadiness catches and responds with 500
      await getReadiness({}, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      const payload = mockRes.json.mock.calls[0][0];
      expect(payload).toMatchObject({
        status: 'DOWN',
        error: 'Failed to execute readiness checks',
        details: 'unexpected'
      });
    });
  });
});