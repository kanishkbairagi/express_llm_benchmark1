import { jest } from '@jest/globals';
import { SystemHealth, getLiveness, getReadiness } from '../dataset/25_health_controller.js';

describe('Health Controller', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  describe('SystemHealth', () => {
    test('pingDatabase resolves with default UP status and latency', async () => {
      const result = await SystemHealth.pingDatabase();
      expect(result).toEqual({ status: 'UP', latencyMs: 3 });
    });

    test('pingRedis resolves with default UP status and latency', async () => {
      const result = await SystemHealth.pingRedis();
      expect(result).toEqual({ status: 'UP', latencyMs: 1 });
    });
  });

  describe('getLiveness', () => {
    test('should return 200 status with UP status and uptime', async () => {
      await getLiveness(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'UP',
          timestamp: expect.any(String),
          uptimeSeconds: expect.any(Number)
        })
      );
    });

    test('should return 500 status when an unhandled error occurs', async () => {
      jest.spyOn(process, 'uptime').mockImplementationOnce(() => {
        throw new Error('Process uptime fail');
      });

      await getLiveness(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        status: 'DOWN',
        error: 'Process uptime fail'
      });
    });
  });

  describe('getReadiness', () => {
    test('should return 200 when all checks pass', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 5 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 2 });

      await getReadiness(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
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

    test('should return 503 if database check returns non-UP status', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'DEGRADED', latencyMs: 500 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });

      await getReadiness(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'DOWN',
          checks: expect.objectContaining({
            database: { status: 'DEGRADED', latencyMs: 500 },
            redis: { status: 'UP', latencyMs: 1 }
          })
        })
      );
    });

    test('should return 503 if database check throws error', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockRejectedValue(new Error('DB Timeout'));
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });

      await getReadiness(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'DOWN',
          checks: expect.objectContaining({
            database: { status: 'DOWN', error: 'DB Timeout' },
            redis: { status: 'UP', latencyMs: 1 }
          })
        })
      );
    });

    test('should return 503 if redis check returns non-UP status', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 2 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UNAVAILABLE' });

      await getReadiness(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'DOWN',
          checks: expect.objectContaining({
            database: { status: 'UP', latencyMs: 2 },
            redis: { status: 'UNAVAILABLE' }
          })
        })
      );
    });

    test('should return 503 if redis check throws error', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 2 });
      jest.spyOn(SystemHealth, 'pingRedis').mockRejectedValue(new Error('Redis Connection Error'));

      await getReadiness(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'DOWN',
          checks: expect.objectContaining({
            database: { status: 'UP', latencyMs: 2 },
            redis: { status: 'DOWN', error: 'Redis Connection Error' }
          })
        })
      );
    });

    test('should mark memory status as WARN if heap usage exceeds 1500MB', async () => {
      jest.spyOn(SystemHealth, 'pingDatabase').mockResolvedValue({ status: 'UP', latencyMs: 2 });
      jest.spyOn(SystemHealth, 'pingRedis').mockResolvedValue({ status: 'UP', latencyMs: 1 });
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: 1600 * 1024 * 1024,
        rss: 2000 * 1024 * 1024,
        heapTotal: 2000 * 1024 * 1024,
        external: 0,
        arrayBuffers: 0
      });

      await getReadiness(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'UP',
          checks: expect.objectContaining({
            memory: {
              status: 'WARN',
              heapUsedMb: 1600,
              rssMb: 2000
            }
          })
        })
      );
    });

    test('should return 500 if an unexpected error occurs during check execution', async () => {
      jest.spyOn(process, 'memoryUsage').mockImplementationOnce(() => {
        throw new Error('Unexpected memory check failure');
      });

      await getReadiness(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        status: 'DOWN',
        error: 'Failed to execute readiness checks',
        details: 'Unexpected memory check failure'
      });
    });
  });
});