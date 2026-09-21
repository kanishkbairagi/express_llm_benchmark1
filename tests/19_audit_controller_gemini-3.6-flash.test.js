import { getAuditLogs, createAuditEntry, AuditLogModel } from '../dataset/19_audit_controller.js';
import { jest } from '@jest/globals';

describe('Audit Controller Unit Tests', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.restoreAllMocks();
    mockReq = {
      user: { role: 'admin', id: 'user123' },
      query: {},
      body: {},
      headers: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('getAuditLogs', () => {
    test('should return 403 if user role is missing or not admin/auditor', async () => {
      mockReq.user = { role: 'user' };

      await getAuditLogs(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied: Requires administrator or auditor privileges'
      });
    });

    test('should return 403 if req.user is undefined', async () => {
      mockReq.user = undefined;

      await getAuditLogs(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    test('should allow access for auditor role', async () => {
      mockReq.user = { role: 'auditor' };
      jest.spyOn(AuditLogModel, 'findWithFilters').mockResolvedValue({ total: 0, logs: [] });

      await getAuditLogs(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    test('should return 400 for invalid page parameter', async () => {
      mockReq.query = { page: 'invalid' };

      await getAuditLogs(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Pagination parameters must be positive integers (limit <= 100)'
      });
    });

    test('should return 400 for page < 1', async () => {
      mockReq.query = { page: '0' };

      await getAuditLogs(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    test('should return 400 for limit > 100', async () => {
      mockReq.query = { limit: '101' };

      await getAuditLogs(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    test('should return 400 for invalid action filter', async () => {
      mockReq.query = { action: 'INVALID_ACTION' };

      await getAuditLogs(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid action filter')
        })
      );
    });

    test('should return 400 for invalid severity filter', async () => {
      mockReq.query = { severity: 'extreme' };

      await getAuditLogs(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid severity filter')
        })
      );
    });

    test('should return 400 for invalid startDate format', async () => {
      mockReq.query = { startDate: 'not-a-date' };

      await getAuditLogs(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid startDate format'
      });
    });

    test('should return 400 for invalid endDate format', async () => {
      mockReq.query = { endDate: 'not-a-date' };

      await getAuditLogs(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid endDate format'
      });
    });

    test('should apply valid filters and default pagination correctly', async () => {
      mockReq.query = {
        actorId: ' actor1 ',
        action: ' login ',
        severity: ' WARNING ',
        startDate: '2023-01-01',
        endDate: '2023-01-31',
        page: '2',
        limit: '10'
      };

      const mockLogs = [{ id: '1', action: 'LOGIN' }];
      const findSpy = jest.spyOn(AuditLogModel, 'findWithFilters').mockResolvedValue({
        total: 25,
        logs: mockLogs
      });

      await getAuditLogs(mockReq, mockRes);

      expect(findSpy).toHaveBeenCalledWith(
        {
          actorId: 'actor1',
          action: 'LOGIN',
          severity: 'warning',
          startDate: new Date('2023-01-01'),
          endDate: new Date('2023-01-31')
        },
        {
          skip: 10,
          limit: 10
        }
      );

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          total: 25,
          page: 2,
          totalPages: 3,
          logs: mockLogs
        }
      });
    });

    test('should return totalPages as 1 when total is 0', async () => {
      jest.spyOn(AuditLogModel, 'findWithFilters').mockResolvedValue({
        total: 0,
        logs: []
      });

      await getAuditLogs(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          total: 0,
          page: 1,
          totalPages: 1,
          logs: []
        }
      });
    });

    test('should return 500 when database throws an error', async () => {
      jest.spyOn(AuditLogModel, 'findWithFilters').mockRejectedValue(new Error('Database error'));

      await getAuditLogs(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve system audit logs',
        details: 'Database error'
      });
    });
  });

  describe('createAuditEntry', () => {
    test('should return 400 if required fields are missing', async () => {
      mockReq.body = { action: 'CREATE' }; // missing targetResourceId & targetResourceType

      await createAuditEntry(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'action, targetResourceId, and targetResourceType are required'
      });
    });

    test('should return 400 if action is invalid', async () => {
      mockReq.body = {
        action: 'FLY',
        targetResourceId: 'res1',
        targetResourceType: 'document'
      };

      await createAuditEntry(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid action')
        })
      );
    });

    test('should return 400 if severity is invalid', async () => {
      mockReq.body = {
        action: 'CREATE',
        targetResourceId: 'res1',
        targetResourceType: 'document',
        severity: 'fatal'
      };

      await createAuditEntry(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid severity level')
        })
      );
    });

    test('should successfully create audit log with user actorId and req.ip', async () => {
      mockReq.ip = '192.168.1.1';
      mockReq.body = {
        action: ' create ',
        targetResourceId: 'res1',
        targetResourceType: 'document',
        severity: ' CRITICAL ',
        details: { key: 'value' }
      };

      const createdLog = { id: 'audit_1', ...mockReq.body, actorId: 'user123' };
      const createSpy = jest.spyOn(AuditLogModel, 'create').mockResolvedValue(createdLog);

      await createAuditEntry(mockReq, mockRes);

      expect(createSpy).toHaveBeenCalledWith({
        actorId: 'user123',
        action: 'CREATE',
        targetResourceId: 'res1',
        targetResourceType: 'document',
        severity: 'critical',
        details: { key: 'value' },
        ipAddress: '192.168.1.1'
      });

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: createdLog
      });
    });

    test('should fallback to actorId system, default severity info, and default IP when not provided', async () => {
      mockReq.user = undefined;
      mockReq.ip = undefined;
      mockReq.headers = {};
      mockReq.body = {
        action: 'DELETE',
        targetResourceId: 'res1',
        targetResourceType: 'document'
      };

      const createSpy = jest.spyOn(AuditLogModel, 'create').mockResolvedValue({ id: 'audit_2' });

      await createAuditEntry(mockReq, mockRes);

      expect(createSpy).toHaveBeenCalledWith({
        actorId: 'system',
        action: 'DELETE',
        targetResourceId: 'res1',
        targetResourceType: 'document',
        severity: 'info',
        details: {},
        ipAddress: '127.0.0.1'
      });

      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    test('should extract IP from x-forwarded-for header if req.ip is undefined', async () => {
      mockReq.ip = undefined;
      mockReq.headers = { 'x-forwarded-for': '10.0.0.1' };
      mockReq.body = {
        action: 'UPDATE',
        targetResourceId: 'res1',
        targetResourceType: 'document'
      };

      const createSpy = jest.spyOn(AuditLogModel, 'create').mockResolvedValue({ id: 'audit_3' });

      await createAuditEntry(mockReq, mockRes);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '10.0.0.1'
        })
      );
    });

    test('should return 500 when creation throws an error', async () => {
      mockReq.body = {
        action: 'UPDATE',
        targetResourceId: 'res1',
        targetResourceType: 'document'
      };

      jest.spyOn(AuditLogModel, 'create').mockRejectedValue(new Error('Write error'));

      await createAuditEntry(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to record audit log entry',
        details: 'Write error'
      });
    });
  });
});