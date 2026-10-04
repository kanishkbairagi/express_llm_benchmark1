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
    test('pingDatabase returns status UP and latency', async () => {
      const result = await SystemHealth.pingDatabase();
      expect(result).toEqual({ status: 'UP', latencyMs: 3 });
    });

    test('pingRedis returns status UP and latency', async () => {
      const result = await SystemHealth.pingRedis();
      expect(result).toEqual({ status: 'UP', latencyMs: 1 });
    });
  });

  describe('getLiveness', () => {
    test('returns 200 and UP status with metadata', async () => {
      await getLiveness(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'UP',
          timestamp: expect.any(String),
          uptimeSeconds: expect.any(Number)
        })
      );
    });

    test('returns 500 when an error is thrown', async () => {
      const resMock = {
        status: jest.fn().mockReturnValueOnce({
          json: jest.fn().mockImplementationOnce(() => {
            throw new Error('Liveness failure');
          })
        }).mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };

      await getLiveness(mockReq, resMock);

      expect(resMock.status).toHaveBeenLastCalledWith(500);
      expect(resMock.json).toHaveBeenLastCalledWith({
        status: 'DOWN',
        error: 'Liveness failure'
      });
    });
  });

  describe('getReadiness', () => {
    test('returns 200 and status UP when all health checks pass', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 5 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 2 });

      await getReadiness(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'UP',
          timestamp: expect.any(String),
          checks: expect.objectContaining({
            database: { status: 'UP', latencyMs: 5 },
            redis: { status: 'UP', latencyMs: 2 },
            memory: expect.objectContaining({
              status: 'UP',
              heapUsedMb: expect.any(Number),
              rssMb: expect.any(Number)
            })
          })
        })
      );
    });

    test('returns 503 if database check returns a non-UP status', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'DOWN', latencyMs: 100 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });

      await getReadiness(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'DOWN',
          checks: expect.objectContaining({
            database: { status: 'DOWN', latencyMs: 100 },
            redis: { status: 'UP', latencyMs: 1 }
          })
        })
      );
    });

    test('returns 503 if database check throws an exception', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockRejectedValue(new Error('Database offline'));
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });

      await getReadiness(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'DOWN',
          checks: expect.objectContaining({
            database: { status: 'DOWN', error: 'Database offline' },
            redis: { status: 'UP', latencyMs: 1 }
          })
        })
      );
    });

    test('returns 503 if redis check returns a non-UP status', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 2 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'DEGRADED', latencyMs: 50 });

      await getReadiness(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'DOWN',
          checks: expect.objectContaining({
            database: { status: 'UP', latencyMs: 2 },
            redis: { status: 'DEGRADED', latencyMs: 50 }
          })
        })
      );
    });

    test('returns 503 if redis check throws an exception', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 2 });
      jest.spyOn(SystemHealth, 'pingRedis').mockRejectedValue(new Error('Redis timeout'));

      await getReadiness(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'DOWN',
          checks: expect.objectContaining({
            database: { status: 'UP', latencyMs: 2 },
            redis: { status: 'DOWN', error: 'Redis timeout' }
          })
        })
      );
    });

    test('flags memory check status as WARN when heapUsed exceeds 1500MB', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 2 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });

      const highMemoryBytes = 1600 * 1024 * 1024;
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: highMemoryBytes,
        rss: highMemoryBytes,
        heapTotal: highMemoryBytes * 2,
        external: 0,
        arrayBuffers: 0
      });

      await getReadiness(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'UP',
          checks: expect.objectContaining({
            memory: {
              status: 'WARN',
              heapUsedMb: 1600,
              rssMb: 1600
            }
          })
        })
      );
    });

    test('returns 500 when an unhandled error occurs during execution', async () => {
      jest.spyOn(process, 'memoryUsage').mockImplementation(() => {
        throw new Error('Memory inspect error');
      });

      await getReadiness(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'DOWN',
        error: 'Failed to execute readiness checks',
        details: 'Memory inspect error'
      });
    });
  });
});