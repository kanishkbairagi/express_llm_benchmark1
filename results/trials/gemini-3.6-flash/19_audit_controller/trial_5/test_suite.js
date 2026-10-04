import { jest } from '@jest/globals';
import { getAuditLogs, createAuditEntry, AuditLogModel } from '../dataset/19_audit_controller.js';

describe('19_audit_controller.js', () => {
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('AuditLogModel default methods', () => {
    test('findWithFilters should return default structure', async () => {
      const result = await AuditLogModel.findWithFilters({}, { skip: 0, limit: 10 });
      expect(result).toEqual({ total: 0, logs: [] });
    });

    test('create should return created object with id and timestamp', async () => {
      const data = { action: 'LOGIN', actorId: 'user1' };
      const result = await AuditLogModel.create(data);
      expect(result).toMatchObject(data);
      expect(result.id).toMatch(/^audit_/);
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('getAuditLogs', () => {
    test('should reject request if user role is missing or invalid', async () => {
      const reqNoUser = { query: {} };
      await getAuditLogs(reqNoUser, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied: Requires administrator or auditor privileges'
      });

      const reqUserRole = { user: { role: 'user' }, query: {} };
      await getAuditLogs(reqUserRole, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    test('should allow access for admin and auditor roles', async () => {
      const spy = jest.spyOn(AuditLogModel, 'findWithFilters').mockResolvedValue({ total: 0, logs: [] });

      const reqAdmin = { user: { role: 'admin' }, query: {} };
      await getAuditLogs(reqAdmin, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(200);

      const reqAuditor = { user: { role: 'auditor' }, query: {} };
      await getAuditLogs(reqAuditor, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(200);

      spy.mockRestore();
    });

    test('should validate pagination parameters', async () => {
      const invalidPages = ['0', '-5', 'abc'];
      for (const page of invalidPages) {
        const req = { user: { role: 'admin' }, query: { page } };
        await getAuditLogs(req, mockRes);
        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: 'Pagination parameters must be positive integers (limit <= 100)'
        });
      }

      const invalidLimits = ['0', '101', 'xyz'];
      for (const limit of invalidLimits) {
        const req = { user: { role: 'admin' }, query: { limit } };
        await getAuditLogs(req, mockRes);
        expect(mockRes.status).toHaveBeenCalledWith(400);
      }
    });

    test('should validate action filter', async () => {
      const reqInvalidAction = { user: { role: 'admin' }, query: { action: 'INVALID_ACTION' } };
      await getAuditLogs(reqInvalidAction, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid action filter')
        })
      );
    });

    test('should validate severity filter', async () => {
      const reqInvalidSeverity = { user: { role: 'admin' }, query: { severity: 'fatal' } };
      await getAuditLogs(reqInvalidSeverity, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid severity filter')
        })
      );
    });

    test('should validate date filters', async () => {
      const reqInvalidStartDate = { user: { role: 'admin' }, query: { startDate: 'not-a-date' } };
      await getAuditLogs(reqInvalidStartDate, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ success: false, error: 'Invalid startDate format' });

      const reqInvalidEndDate = { user: { role: 'admin' }, query: { endDate: 'invalid-date' } };
      await getAuditLogs(reqInvalidEndDate, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ success: false, error: 'Invalid endDate format' });
    });

    test('should pass filters and pagination to AuditLogModel.findWithFilters', async () => {
      const spy = jest.spyOn(AuditLogModel, 'findWithFilters').mockResolvedValue({
        total: 25,
        logs: [{ id: '1' }]
      });

      const req = {
        user: { role: 'admin' },
        query: {
          actorId: ' user123 ',
          action: ' login ',
          severity: ' CRITICAL ',
          startDate: '2023-01-01',
          endDate: '2023-01-31',
          page: '2',
          limit: '10'
        }
      };

      await getAuditLogs(req, mockRes);

      expect(spy).toHaveBeenCalledWith(
        {
          actorId: 'user123',
          action: 'LOGIN',
          severity: 'critical',
          startDate: new Date('2023-01-01'),
          endDate: new Date('2023-01-31')
        },
        { skip: 10, limit: 10 }
      );

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          total: 25,
          page: 2,
          totalPages: 3,
          logs: [{ id: '1' }]
        }
      });

      spy.mockRestore();
    });

    test('should handle zero total logs correctly in totalPages calculation', async () => {
      const spy = jest.spyOn(AuditLogModel, 'findWithFilters').mockResolvedValue({
        total: 0,
        logs: []
      });

      const req = { user: { role: 'admin' }, query: {} };
      await getAuditLogs(req, mockRes);

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

      spy.mockRestore();
    });

    test('should return 500 when database operation throws error', async () => {
      const spy = jest.spyOn(AuditLogModel, 'findWithFilters').mockRejectedValue(new Error('DB failure'));

      const req = { user: { role: 'admin' } };
      await getAuditLogs(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve system audit logs',
        details: 'DB failure'
      });

      spy.mockRestore();
    });
  });

  describe('createAuditEntry', () => {
    test('should require action, targetResourceId, and targetResourceType', async () => {
      const req = { body: {} };
      await createAuditEntry(req, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'action, targetResourceId, and targetResourceType are required'
      });
    });

    test('should validate action', async () => {
      const req = {
        body: {
          action: 'BAD_ACTION',
          targetResourceId: 'res1',
          targetResourceType: 'user'
        }
      };
      await createAuditEntry(req, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid action')
        })
      );
    });

    test('should validate severity', async () => {
      const req = {
        body: {
          action: 'CREATE',
          targetResourceId: 'res1',
          targetResourceType: 'user',
          severity: 'HIGH'
        }
      };
      await createAuditEntry(req, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid severity level')
        })
      );
    });

    test('should successfully create log entry with default system actor and default fallback IP', async () => {
      const spy = jest.spyOn(AuditLogModel, 'create').mockResolvedValue({ id: 'audit_1' });

      const req = {
        body: {
          action: 'delete',
          targetResourceId: 'res99',
          targetResourceType: 'document'
        },
        headers: {}
      };

      await createAuditEntry(req, mockRes);

      expect(spy).toHaveBeenCalledWith({
        actorId: 'system',
        action: 'DELETE',
        targetResourceId: 'res99',
        targetResourceType: 'document',
        severity: 'info',
        details: {},
        ipAddress: '127.0.0.1'
      });

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { id: 'audit_1' }
      });

      spy.mockRestore();
    });

    test('should correctly extract actor, ip from req.ip or x-forwarded-for header', async () => {
      const spy = jest.spyOn(AuditLogModel, 'create').mockResolvedValue({ id: 'audit_2' });

      const reqWithIp = {
        user: { id: 'user_123' },
        ip: '192.168.1.1',
        headers: {},
        body: {
          action: 'UPDATE',
          targetResourceId: 'res1',
          targetResourceType: 'user',
          severity: 'WARNING',
          details: { field: 'name' }
        }
      };

      await createAuditEntry(reqWithIp, mockRes);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'user_123',
          severity: 'warning',
          ipAddress: '192.168.1.1',
          details: { field: 'name' }
        })
      );

      const reqWithHeader = {
        user: { id: 'user_456' },
        headers: { 'x-forwarded-for': '10.0.0.1' },
        body: {
          action: 'LOGIN',
          targetResourceId: 'res1',
          targetResourceType: 'session'
        }
      };

      await createAuditEntry(reqWithHeader, mockRes);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'user_456',
          ipAddress: '10.0.0.1'
        })
      );

      spy.mockRestore();
    });

    test('should return 500 on database creation error', async () => {
      const spy = jest.spyOn(AuditLogModel, 'create').mockRejectedValue(new Error('Write failed'));

      const req = {
        body: {
          action: 'CREATE',
          targetResourceId: 'res1',
          targetResourceType: 'user'
        },
        headers: {}
      };

      await createAuditEntry(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to record audit log entry',
        details: 'Write failed'
      });

      spy.mockRestore();
    });
  });
});