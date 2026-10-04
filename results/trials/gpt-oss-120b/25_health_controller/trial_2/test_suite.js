import { jest } from '@jest/globals';
import { getLiveness, getReadiness, SystemHealth } from '../dataset/25_health_controller.js';

describe('Health Controller', () => {
  const createRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('getLiveness', () => {
    it('should respond with 200 and proper payload', async () => {
      const req = {};
      const res = createRes();

      await getLiveness(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload).toMatchObject({
        status: 'UP',
      });
      expect(typeof payload.timestamp).toBe('string');
      expect(typeof payload.uptimeSeconds).toBe('number');
    });
  });

  describe('getReadiness', () => {
    const mockMemoryUsage = (heapUsedBytes, rssBytes) => {
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: heapUsedBytes,
        rss: rssBytes,
        heapTotal: 0,
        external: 0,
        arrayBuffers: 0,
      });
    };

    it('should return UP when all checks pass', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 5 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 2 });
      mockMemoryUsage(500 * 1024 * 1024, 800 * 1024 * 1024); // 500MB heap, 800MB rss

      const req = {};
      const res = createRes();

      await getReadiness(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.status).toBe('UP');
      expect(body.checks.database).toEqual({ status: 'UP', latencyMs: 5 });
      expect(body.checks.redis).toEqual({ status: 'UP', latencyMs: 2 });
      expect(body.checks.memory.status).toBe('UP');
      expect(body.checks.memory.heapUsedMb).toBe(500);
    });

    it('should return DOWN when database check fails', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'DOWN', latencyMs: 5 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 2 });
      mockMemoryUsage(400 * 1024 * 1024, 600 * 1024 * 1024);

      const req = {};
      const res = createRes();

      await getReadiness(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      const body = res.json.mock.calls[0][0];
      expect(body.status).toBe('DOWN');
      expect(body.checks.database.status).toBe('DOWN');
    });

    it('should handle database exception gracefully', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockRejectedValue(new Error('DB error'));
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 2 });
      mockMemoryUsage(300 * 1024 * 1024, 500 * 1024 * 1024);

      const req = {};
      const res = createRes();

      await getReadiness(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      const body = res.json.mock.calls[0][0];
      expect(body.status).toBe('DOWN');
      expect(body.checks.database).toMatchObject({ status: 'DOWN', error: 'DB error' });
    });

    it('should flag memory warning without affecting overall UP status', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 5 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 2 });
      // 2GB heap to trigger WARN
      mockMemoryUsage(2 * 1024 * 1024 * 1024, 1 * 1024 * 1024 * 1024);

      const req = {};
      const res = createRes();

      await getReadiness(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.status).toBe('UP');
      expect(body.checks.memory.status).toBe('WARN');
      expect(body.checks.memory.heapUsedMb).toBeGreaterThan(1500);
    });
  });
});