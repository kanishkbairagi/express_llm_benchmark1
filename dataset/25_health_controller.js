// 25_health_controller.js - Microservice Health Checks & DB Ping

// Mock System & Dependency Checks
export const SystemHealth = {
  pingDatabase: async () => ({ status: 'UP', latencyMs: 3 }),
  pingRedis: async () => ({ status: 'UP', latencyMs: 1 })
};

export const getLiveness = async (req, res) => {
  try {
    return res.status(200).json({
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime())
    });
  } catch (error) {
    return res.status(500).json({
      status: 'DOWN',
      error: error.message
    });
  }
};

export const getReadiness = async (req, res) => {
  try {
    const checks = {};
    let isHealthy = true;

    // Database check
    try {
      const dbResult = await SystemHealth.pingDatabase();
      checks.database = dbResult;
      if (dbResult.status !== 'UP') isHealthy = false;
    } catch (err) {
      checks.database = { status: 'DOWN', error: err.message };
      isHealthy = false;
    }

    // Cache check
    try {
      const redisResult = await SystemHealth.pingRedis();
      checks.redis = redisResult;
      if (redisResult.status !== 'UP') isHealthy = false;
    } catch (err) {
      checks.redis = { status: 'DOWN', error: err.message };
      isHealthy = false;
    }

    // Memory threshold check (flag warning if heapUsed > 1.5GB)
    const mem = process.memoryUsage();
    const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
    checks.memory = {
      status: heapUsedMb > 1500 ? 'WARN' : 'UP',
      heapUsedMb,
      rssMb: Math.round(mem.rss / 1024 / 1024)
    };

    const statusCode = isHealthy ? 200 : 503;

    return res.status(statusCode).json({
      status: isHealthy ? 'UP' : 'DOWN',
      timestamp: new Date().toISOString(),
      checks
    });
  } catch (error) {
    return res.status(500).json({
      status: 'DOWN',
      error: 'Failed to execute readiness checks',
      details: error.message
    });
  }
};
