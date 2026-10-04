import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  getAuditLogs,
  createAuditEntry,
  AuditLogModel
} from '../dataset/19_audit_controller.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('getAuditLogs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should deny access for non‑admin/auditor roles', async () => {
    const req = { user: { role: 'user' }, query: {} };
    const res = mockRes();

    await getAuditLogs(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Access denied: Requires administrator or auditor privileges'
    });
  });

  it('should validate pagination parameters', async () => {
    const req = { user: { role: 'admin' }, query: { page: '0', limit: '-5' } };
    const res = mockRes();

    await getAuditLogs(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Pagination parameters must be positive integers (limit <= 100)'
    });
  });

  it('should reject an invalid action filter', async () => {
    const req = {
      user: { role: 'auditor' },
      query: { action: 'invalidAction' }
    };
    const res = mockRes();

    await getAuditLogs(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: expect.stringContaining('Invalid action filter')
    });
  });

  it('should reject an invalid severity filter', async () => {
    const req = {
      user: { role: 'admin' },
      query: { severity: 'high' }
    };
    const res = mockRes();

    await getAuditLogs(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: expect.stringContaining('Invalid severity filter')
    });
  });

  it('should return logs with correct pagination and filters', async () => {
    const fakeData = {
      total: 42,
      logs: [{ id: 'audit_1' }, { id: 'audit_2' }]
    };
    jest.spyOn(AuditLogModel, 'findWithFilters').mockResolvedValue(fakeData);

    const req = {
      user: { role: 'admin' },
      query: {
        actorId: '123',
        action: 'login',
        severity: 'INFO',
        startDate: '2023-01-01',
        endDate: '2023-01-31',
        page: '2',
        limit: '10'
      }
    };
    const res = mockRes();

    await getAuditLogs(req, res);

    expect(AuditLogModel.findWithFilters).toHaveBeenCalledWith(
      {
        actorId: '123',
        action: 'LOGIN',
        severity: 'info',
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-01-31')
      },
      { skip: 10, limit: 10 }
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        total: 42,
        page: 2,
        totalPages: Math.ceil(42 / 10),
        logs: fakeData.logs
      }
    });
  });

  it('should handle unexpected errors with 500', async () => {
    jest.spyOn(AuditLogModel, 'findWithFilters').mockRejectedValue(new Error('DB fail'));

    const req = { user: { role: 'admin' }, query: {} };
    const res = mockRes();

    await getAuditLogs(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to retrieve system audit logs',
      details: 'DB fail'
    });
  });
});

describe('createAuditEntry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject missing required fields', async () => {
    const req = { user: { id: 'u1' }, body: { action: 'CREATE' } };
    const res = mockRes();

    await createAuditEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'action, targetResourceId, and targetResourceType are required'
    });
  });

  it('should reject invalid action', async () => {
    const req = {
      user: { id: 'u2' },
      body: { action: 'bad', targetResourceId: 'r1', targetResourceType: 'type' }
    };
    const res = mockRes();

    await createAuditEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: expect.stringContaining('Invalid action')
    });
  });

  it('should reject invalid severity level', async () => {
    const req = {
      user: { id: 'u3' },
      body: {
        action: 'delete',
        targetResourceId: 'r2',
        targetResourceType: 'type',
        severity: 'urgent'
      }
    };
    const res = mockRes();

    await createAuditEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: expect.stringContaining('Invalid severity level')
    });
  });

  it('should create a log entry with transformed data', async () => {
    const createdEntry = {
      id: 'audit_123',
      actorId: 'u4',
      action: 'UPDATE',
      targetResourceId: 'res42',
      targetResourceType: 'document',
      severity: 'warning',
      details: { foo: 'bar' },
      ipAddress: '127.0.0.1',
      timestamp: new Date()
    };
    jest.spyOn(AuditLogModel, 'create').mockResolvedValue(createdEntry);

    const req = {
      user: { id: 'u4' },
      ip: '10.0.0.5',
      body: {
        action: 'update',
        targetResourceId: 'res42',
        targetResourceType: 'document',
        severity: 'WARNING',
        details: { foo: 'bar' }
      }
    };
    const res = mockRes();

    await createAuditEntry(req, res);

    expect(AuditLogModel.create).toHaveBeenCalledWith({
      actorId: 'u4',
      action: 'UPDATE',
      targetResourceId: 'res42',
      targetResourceType: 'document',
      severity: 'warning',
      details: { foo: 'bar' },
      ipAddress: '10.0.0.5'
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: createdEntry
    });
  });

  it('should default actorId to "system" when user missing', async () => {
    const createdEntry = { id: 'audit_999', actorId: 'system' };
    jest.spyOn(AuditLogModel, 'create').mockResolvedValue(createdEntry);

    const req = {
      body: {
        action: 'login',
        targetResourceId: 'rX',
        targetResourceType: 'session'
      },
      headers: {}
    };
    const res = mockRes();

    await createAuditEntry(req, res);

    expect(AuditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'system' })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('should handle unexpected errors with 500', async () => {
    jest.spyOn(AuditLogModel, 'create').mockRejectedValue(new Error('DB insert fail'));

    const req = {
      user: { id: 'u5' },
      body: {
        action: 'delete',
        targetResourceId: 'r9',
        targetResourceType: 'file'
      }
    };
    const res = mockRes();

    await createAuditEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to record audit log entry',
      details: 'DB insert fail'
    });
  });
});