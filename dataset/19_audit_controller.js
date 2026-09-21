// 19_audit_controller.js - Admin System Activity Logs

// Mock Database Model
export const AuditLogModel = {
  findWithFilters: async (filters, pagination) => ({
    total: 0,
    logs: []
  }),
  create: async (data) => ({ id: `audit_${Date.now()}`, ...data, timestamp: new Date() })
};

const VALID_ACTIONS = ['LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'PERMISSION_CHANGE'];
const VALID_SEVERITIES = ['info', 'warning', 'critical'];

export const getAuditLogs = async (req, res) => {
  try {
    const userRole = req.user?.role;
    if (userRole !== 'admin' && userRole !== 'auditor') {
      return res.status(403).json({
        success: false,
        error: 'Access denied: Requires administrator or auditor privileges'
      });
    }

    const {
      actorId,
      action,
      severity,
      startDate,
      endDate,
      page = 1,
      limit = 20
    } = req.query || {};

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (isNaN(pageNum) || pageNum < 1 || isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: 'Pagination parameters must be positive integers (limit <= 100)'
      });
    }

    const filters = {};

    if (actorId) filters.actorId = String(actorId).trim();

    if (action) {
      const upperAction = action.toUpperCase().trim();
      if (!VALID_ACTIONS.includes(upperAction)) {
        return res.status(400).json({
          success: false,
          error: `Invalid action filter. Allowed: ${VALID_ACTIONS.join(', ')}`
        });
      }
      filters.action = upperAction;
    }

    if (severity) {
      const lowerSeverity = severity.toLowerCase().trim();
      if (!VALID_SEVERITIES.includes(lowerSeverity)) {
        return res.status(400).json({
          success: false,
          error: `Invalid severity filter. Allowed: ${VALID_SEVERITIES.join(', ')}`
        });
      }
      filters.severity = lowerSeverity;
    }

    if (startDate && isNaN(new Date(startDate).getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid startDate format' });
    }
    if (endDate && isNaN(new Date(endDate).getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid endDate format' });
    }

    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    const { total, logs } = await AuditLogModel.findWithFilters(filters, {
      skip: (pageNum - 1) * limitNum,
      limit: limitNum
    });

    return res.status(200).json({
      success: true,
      data: {
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum) || 1,
        logs
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve system audit logs',
      details: error.message
    });
  }
};

export const createAuditEntry = async (req, res) => {
  try {
    const actorId = req.user?.id || 'system';
    const { action, targetResourceId, targetResourceType, details, severity = 'info' } = req.body || {};

    if (!action || !targetResourceId || !targetResourceType) {
      return res.status(400).json({
        success: false,
        error: 'action, targetResourceId, and targetResourceType are required'
      });
    }

    const upperAction = action.toUpperCase().trim();
    if (!VALID_ACTIONS.includes(upperAction)) {
      return res.status(400).json({
        success: false,
        error: `Invalid action. Allowed: ${VALID_ACTIONS.join(', ')}`
      });
    }

    const lowerSeverity = severity.toLowerCase().trim();
    if (!VALID_SEVERITIES.includes(lowerSeverity)) {
      return res.status(400).json({
        success: false,
        error: `Invalid severity level. Allowed: ${VALID_SEVERITIES.join(', ')}`
      });
    }

    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';

    const logEntry = await AuditLogModel.create({
      actorId,
      action: upperAction,
      targetResourceId,
      targetResourceType,
      severity: lowerSeverity,
      details: details || {},
      ipAddress
    });

    return res.status(201).json({
      success: true,
      data: logEntry
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to record audit log entry',
      details: error.message
    });
  }
};
