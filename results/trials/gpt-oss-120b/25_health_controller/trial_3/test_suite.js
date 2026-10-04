import { jest } from '@jest/globals';
import {
  getLiveness,
  getReadiness,
  SystemHealth
} from '../dataset/25_health_controller.js';

describe('Health Controller', () => {
  const createRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getLiveness', () => {
    it('should respond with 200 and proper payload', async () => {
      const req = {};
      const res = createRes();

      // Mock process.uptime to a deterministic value
      jest.spyOn(process, 'uptime').mockReturnValue(123.456);

      await getLiveness(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload).toMatchObject({ status: 'UP' });
      expect(typeof payload.timestamp).toBe('string');
      expect(new Date(payload.timestamp).toString()).not.toBe('Invalid Date');
      expect(payload.uptimeSeconds).toBe(123);
    });
  });

  describe('getReadiness', () => {
    const mockMemoryUsage = (heapUsedMb, rssMb) => {
      const heapUsed = heapUsedMb * 1024 * 1024;
      const rss = rssMb * 1024 * 1024;
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed,
        rss,
        heapTotal: heapUsed,
        external: 0,
        arrayBuffers: 0
      });
    };

    it('should return 200 with all checks UP when everything is healthy', async () => {
      const req = {};
      const res = createRes();

      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 2 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });
      mockMemoryUsage(500, 800); // 500 MB heap, 800 MB rss

      await getReadiness(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.status).toBe('UP');
      expect(payload.checks.database).toEqual({ status: 'UP', latencyMs: 2 });
      expect(payload.checks.redis).toEqual({ status: 'UP', latencyMs: 1 });
      expect(payload.checks.memory.status).toBe('UP');
      expect(payload.checks.memory.heapUsedMb).toBe(500);
    });

    it('should return 503 with DOWN status when database check fails', async () => {
      const req = {};
      const res = createRes();

      jest.spyOn(SystemHealth, 'pingDatabase').mockRejectedValue(new Error('DB unreachable'));
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });
      mockMemoryUsage(400, 600);

      await getReadiness(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      const payload = res.json.mock.calls[0][0];
      expect(payload.status).toBe('DOWN');
      expect(payload.checks.database).toMatchObject({
        status: 'DOWN',
        error: 'DB unreachable'
      });
      expect(payload.checks.redis).toEqual({ status: 'UP', latencyMs: 1 });
    });

    it('should return 503 with DOWN status when redis check fails', async () => {
      const req = {};
      const res = createRes();

      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 2 });
      jest.spyOn(SystemHealth, 'pingRedis').mockRejectedValue(new Error('Redis timeout'));
      mockMemoryUsage(300, 500);

      await getReadiness(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      const payload = res.json.mock.calls[0][0];
      expect(payload.status).toBe('DOWN');
      expect(payload.checks.redis).toMatchObject({
        status: 'DOWN',
        error: 'Redis timeout'
      });
    });

    it('should flag memory as WARN when heap usage exceeds 1.5GB but still return UP', async () => {
      const req = {};
      const res = createRes();

      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 2 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });
      // 1600 MB heap used -> WARN
      mockMemoryUsage(1600, 2000);

      await getReadiness(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.status).toBe('UP');
      expect(payload.checks.memory.status).toBe('WARN');
      expect(payload.checks.memory.heapUsedMb).toBe(1600);
    });

    it('should return 500 when an unexpected error occurs', async () => {
      const req = {};
      const res = createRes();

      // Force an unexpected error inside readiness (e.g., SystemHealth is undefined)
      jest.spyOn(SystemHealth, 'pingDatabase').mockImplementation(() => {
        throw new Error('Unexpected failure');
      });
      jest.spyOn(process, 'memoryUsage').mockImplementation(() => {
        throw new Error('Memory failure');
      });

      await getReadiness(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const payload = res.json.mock.calls[0][0];
      expect(payload.status).toBe('DOWN');
      expect(payload.error).toBe('Failed to execute readiness checks');
      expect(payload.details).toBe('Unexpected failure');
    });
  });
});