import { jest } from '@jest/globals';
import {
  getAuditLogs,
  createAuditEntry,
  AuditLogModel
} from '../dataset/19_audit_controller.js';

const mockReq = (overrides = {}) => ({
  user: { role: 'admin', id: 'admin_123' },
  query: {},
  body: {},
  headers: {},
  ip: undefined,
  ...overrides
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('19_audit_controller.js Unit Tests', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getAuditLogs', () => {
    test('should return 403 if user is missing', async () => {
      const req = mockReq({ user: undefined });
      const res = mockRes();

      await getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied: Requires administrator or auditor privileges'
      });
    });

    test('should return 403 if user role is neither admin nor auditor', async () => {
      const req = mockReq({ user: { role: 'user' } });
      const res = mockRes();

      await getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied: Requires administrator or auditor privileges'
      });
    });

    test('should allow access for auditor role', async () => {
      const req = mockReq({ user: { role: 'auditor' } });
      const res = mockRes();
      jest.spyOn(AuditLogModel, 'findWithFilters').mockResolvedValue({ total: 0, logs: [] });

      await getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should return 400 if page is invalid number or less than 1', async () => {
      const req = mockReq({ query: { page: '0' } });
      const res = mockRes();

      await getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Pagination parameters must be positive integers (limit <= 100)'
      });
    });

    test('should return 400 if limit is greater than 100 or less than 1', async () => {
      const req = mockReq({ query: { limit: '101' } });
      const res = mockRes();

      await getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Pagination parameters must be positive integers (limit <= 100)'
      });
    });

    test('should return 400 if action filter is invalid', async () => {
      const req = mockReq({ query: { action: 'INVALID_ACTION' } });
      const res = mockRes();

      await getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid action filter')
        })
      );
    });

    test('should return 400 if severity filter is invalid', async () => {
      const req = mockReq({ query: { severity: 'invalid_severity' } });
      const res = mockRes();

      await getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid severity filter')
        })
      );
    });

    test('should return 400 if startDate is an invalid date string', async () => {
      const req = mockReq({ query: { startDate: 'not-a-date' } });
      const res = mockRes();

      await getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid startDate format'
      });
    });

    test('should return 400 if endDate is an invalid date string', async () => {
      const req = mockReq({ query: { endDate: 'invalid-date' } });
      const res = mockRes();

      await getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid endDate format'
      });
    });

    test('should apply valid filters and return logs successfully', async () => {
      const mockLogs = [{ id: 'audit_1', action: 'LOGIN' }];
      const findWithFiltersSpy = jest.spyOn(AuditLogModel, 'findWithFilters').mockResolvedValue({
        total: 1,
        logs: mockLogs
      });

      const req = mockReq({
        query: {
          actorId: ' actor_123 ',
          action: ' login ',
          severity: ' INFO ',
          startDate: '2023-01-01',
          endDate: '2023-01-02',
          page: '2',
          limit: '10'
        }
      });
      const res = mockRes();

      await getAuditLogs(req, res);

      expect(findWithFiltersSpy).toHaveBeenCalledWith(
        {
          actorId: 'actor_123',
          action: 'LOGIN',
          severity: 'info',
          startDate: new Date('2023-01-01'),
          endDate: new Date('2023-01-02')
        },
        {
          skip: 10,
          limit: 10
        }
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          total: 1,
          page: 2,
          totalPages: 1,
          logs: mockLogs
        }
      });
    });

    test('should return totalPages as 1 when total is 0', async () => {
      jest.spyOn(AuditLogModel, 'findWithFilters').mockResolvedValue({
        total: 0,
        logs: []
      });

      const req = mockReq();
      const res = mockRes();

      await getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          total: 0,
          page: 1,
          totalPages: 1,
          logs: []
        }
      });
    });

    test('should handle database errors and return 500', async () => {
      jest.spyOn(AuditLogModel, 'findWithFilters').mockRejectedValue(new Error('DB Query Error'));

      const req = mockReq();
      const res = mockRes();

      await getAuditLogs(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve system audit logs',
        details: 'DB Query Error'
      });
    });
  });

  describe('createAuditEntry', () => {
    test('should return 400 if action, targetResourceId, or targetResourceType is missing', async () => {
      const req = mockReq({ body: { action: 'LOGIN' } });
      const res = mockRes();

      await createAuditEntry(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'action, targetResourceId, and targetResourceType are required'
      });
    });

    test('should return 400 if action is invalid', async () => {
      const req = mockReq({
        body: {
          action: 'INVALID',
          targetResourceId: 'res_1',
          targetResourceType: 'user'
        }
      });
      const res = mockRes();

      await createAuditEntry(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid action')
        })
      );
    });

    test('should return 400 if severity is invalid', async () => {
      const req = mockReq({
        body: {
          action: 'CREATE',
          targetResourceId: 'res_1',
          targetResourceType: 'user',
          severity: 'super_critical'
        }
      });
      const res = mockRes();

      await createAuditEntry(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid severity level')
        })
      );
    });

    test('should create audit entry with default values and req.ip', async () => {
      const createdLog = {
        id: 'audit_123',
        actorId: 'admin_123',
        action: 'CREATE',
        targetResourceId: 'res_1',
        targetResourceType: 'document',
        severity: 'info',
        details: {},
        ipAddress: '192.168.1.1'
      };

      const createSpy = jest.spyOn(AuditLogModel, 'create').mockResolvedValue(createdLog);

      const req = mockReq({
        ip: '192.168.1.1',
        body: {
          action: ' create ',
          targetResourceId: 'res_1',
          targetResourceType: 'document'
        }
      });
      const res = mockRes();

      await createAuditEntry(req, res);

      expect(createSpy).toHaveBeenCalledWith({
        actorId: 'admin_123',
        action: 'CREATE',
        targetResourceId: 'res_1',
        targetResourceType: 'document',
        severity: 'info',
        details: {},
        ipAddress: '192.168.1.1'
      });

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: createdLog
      });
    });

    test('should fall back to x-forwarded-for header or 127.0.0.1 for IP and system for actorId', async () => {
      const createSpy = jest.spyOn(AuditLogModel, 'create').mockResolvedValue({});

      const req1 = mockReq({
        user: undefined,
        headers: { 'x-forwarded-for': '10.0.0.1' },
        body: {
          action: 'DELETE',
          targetResourceId: 'res_2',
          targetResourceType: 'post'
        }
      });
      const res1 = mockRes();

      await createAuditEntry(req1, res1);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'system',
          ipAddress: '10.0.0.1'
        })
      );

      const req2 = mockReq({
        user: undefined,
        body: {
          action: 'DELETE',
          targetResourceId: 'res_2',
          targetResourceType: 'post'
        }
      });
      const res2 = mockRes();

      await createAuditEntry(req2, res2);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'system',
          ipAddress: '127.0.0.1'
        })
      );
    });

    test('should handle database errors during create and return 500', async () => {
      jest.spyOn(AuditLogModel, 'create').mockRejectedValue(new Error('Insert error'));

      const req = mockReq({
        body: {
          action: 'UPDATE',
          targetResourceId: 'res_1',
          targetResourceType: 'user'
        }
      });
      const res = mockRes();

      await createAuditEntry(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to record audit log entry',
        details: 'Insert error'
      });
    });
  });
});