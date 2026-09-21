import { jest } from '@jest/globals';
import { SystemHealth, getLiveness, getReadiness } from '../dataset/25_health_controller.js';

describe('25_health_controller', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  describe('SystemHealth', () => {
    test('pingDatabase returns default UP status', async () => {
      const result = await SystemHealth.pingDatabase();
      expect(result).toEqual({ status: 'UP', latencyMs: 3 });
    });

    test('pingRedis returns default UP status', async () => {
      const result = await SystemHealth.pingRedis();
      expect(result).toEqual({ status: 'UP', latencyMs: 1 });
    });
  });

  describe('getLiveness', () => {
    test('should return 200 and liveness data on success', async () => {
      jest.spyOn(process, 'uptime').mockReturnValue(123.45);

      await getLiveness(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'UP',
          uptimeSeconds: 123,
          timestamp: expect.any(String)
        })
      );
    });

    test('should return 500 when an exception occurs in liveness check', async () => {
      jest.spyOn(process, 'uptime').mockImplementation(() => {
        throw new Error('Uptime calculation error');
      });

      await getLiveness(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'DOWN',
        error: 'Uptime calculation error'
      });
    });
  });

  describe('getReadiness', () => {
    test('should return 200 when DB and Redis are UP and memory is healthy', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 2 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: 100 * 1024 * 1024,
        rss: 200 * 1024 * 1024,
        arrayBuffers: 0,
        external: 0,
        heapTotal: 200 * 1024 * 1024
      });

      await getReadiness(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'UP',
          timestamp: expect.any(String),
          checks: expect.objectContaining({
            database: { status: 'UP', latencyMs: 2 },
            redis: { status: 'UP', latencyMs: 1 },
            memory: { status: 'UP', heapUsedMb: 100, rssMb: 200 }
          })
        })
      );
    });

    test('should return WARN memory status when heapUsed > 1500MB but return 200 if DB and Redis are UP', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 2 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: 1600 * 1024 * 1024,
        rss: 2000 * 1024 * 1024,
        arrayBuffers: 0,
        external: 0,
        heapTotal: 2000 * 1024 * 1024
      });

      await getReadiness(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'UP',
          checks: expect.objectContaining({
            memory: { status: 'WARN', heapUsedMb: 1600, rssMb: 2000 }
          })
        })
      );
    });

    test('should return 503 if database status is not UP', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'DOWN', latencyMs: 100 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });

      await getReadiness(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'DOWN',
          checks: expect.objectContaining({
            database: { status: 'DOWN', latencyMs: 100 }
          })
        })
      );
    });

    test('should return 503 if database check throws error', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockRejectedValue(new Error('DB Connection Failed'));
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });

      await getReadiness(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'DOWN',
          checks: expect.objectContaining({
            database: { status: 'DOWN', error: 'DB Connection Failed' }
          })
        })
      );
    });

    test('should return 503 if Redis status is not UP', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 2 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'DOWN', latencyMs: 50 });

      await getReadiness(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'DOWN',
          checks: expect.objectContaining({
            redis: { status: 'DOWN', latencyMs: 50 }
          })
        })
      );
    });

    test('should return 503 if Redis check throws error', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 2 });
      jest.spyOn(SystemHealth, 'pingRedis').mockRejectedValue(new Error('Redis Timeout'));

      await getReadiness(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'DOWN',
          checks: expect.objectContaining({
            redis: { status: 'DOWN', error: 'Redis Timeout' }
          })
        })
      );
    });

    test('should return 500 when top-level exception occurs in readiness checks', async () => {
      jest.spyOn(process, 'memoryUsage').mockImplementation(() => {
        throw new Error('Memory check failure');
      });

      await getReadiness(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'DOWN',
        error: 'Failed to execute readiness checks',
        details: 'Memory check failure'
      });
    });
  });
});