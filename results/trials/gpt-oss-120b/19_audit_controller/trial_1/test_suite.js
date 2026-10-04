import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import {
  getAuditLogs,
  createAuditEntry,
  AuditLogModel
} from '../dataset/19_audit_controller.js';

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('getAuditLogs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AuditLogModel.findWithFilters = jest.fn().mockResolvedValue({
      total: 2,
      logs: [{ id: '1' }, { id: '2' }]
    });
  });

  test('returns 403 when user role is not admin or auditor', async () => {
    const req = { user: { role: 'user' }, query: {} };
    const res = mockResponse();

    await getAuditLogs(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Access denied: Requires administrator or auditor privileges'
    });
  });

  test('returns 400 for invalid pagination parameters', async () => {
    const req = { user: { role: 'admin' }, query: { page: '0', limit: '-5' } };
    const res = mockResponse();

    await getAuditLogs(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Pagination parameters must be positive integers (limit <= 100)'
    });
  });

  test('returns 400 for unknown action filter', async () => {
    const req = {
      user: { role: 'auditor' },
      query: { action: 'invalidAction' }
    };
    const res = mockResponse();

    await getAuditLogs(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: expect.stringContaining('Invalid action filter')
    });
  });

  test('returns 400 for unknown severity filter', async () => {
    const req = {
      user: { role: 'admin' },
      query: { severity: 'unknown' }
    };
    const res = mockResponse();

    await getAuditLogs(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: expect.stringContaining('Invalid severity filter')
    });
  });

  test('returns 400 for malformed startDate', async () => {
    const req = {
      user: { role: 'admin' },
      query: { startDate: 'not-a-date' }
    };
    const res = mockResponse();

    await getAuditLogs(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid startDate format'
    });
  });

  test('returns 200 with correct data and passes filters to model', async () => {
    const now = new Date().toISOString();
    const req = {
      user: { role: 'auditor' },
      query: {
        actorId: '123',
        action: 'login',
        severity: 'Info',
        startDate: now,
        endDate: now,
        page: '2',
        limit: '10'
      }
    };
    const res = mockResponse();

    await getAuditLogs(req, res);

    expect(AuditLogModel.findWithFilters).toHaveBeenCalledWith(
      {
        actorId: '123',
        action: 'LOGIN',
        severity: 'info',
        startDate: new Date(now),
        endDate: new Date(now)
      },
      { skip: 10, limit: 10 }
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        total: 2,
        page: 2,
        totalPages: 1,
        logs: [{ id: '1' }, { id: '2' }]
      }
    });
  });
});

describe('createAuditEntry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AuditLogModel.create = jest.fn().mockResolvedValue({
      id: 'audit_12345',
      actorId: 'system',
      action: 'CREATE',
      targetResourceId: 'res1',
      targetResourceType: 'typeA',
      severity: 'info',
      details: {},
      ipAddress: '127.0.0.1',
      timestamp: new Date()
    });
  });

  test('returns 400 when required fields are missing', async () => {
    const req = { user: {}, body: {} };
    const res = mockResponse();

    await createAuditEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'action, targetResourceId, and targetResourceType are required'
    });
  });

  test('returns 400 for invalid action value', async () => {
    const req = {
      user: { id: 'u1' },
      body: { action: 'invalid', targetResourceId: 'r1', targetResourceType: 't1' }
    };
    const res = mockResponse();

    await createAuditEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: expect.stringContaining('Invalid action')
    });
  });

  test('returns 400 for invalid severity level', async () => {
    const req = {
      user: { id: 'u1' },
      body: {
        action: 'login',
        targetResourceId: 'r1',
        targetResourceType: 't1',
        severity: 'supercritical'
      }
    };
    const res = mockResponse();

    await createAuditEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: expect.stringContaining('Invalid severity level')
    });
  });

  test('creates audit entry successfully and returns 201', async () => {
    const req = {
      user: { id: 'user42' },
      ip: '10.0.0.5',
      body: {
        action: 'update',
        targetResourceId: 'res42',
        targetResourceType: 'document',
        details: { field: 'name' },
        severity: 'Warning'
      }
    };
    const res = mockResponse();

    await createAuditEntry(req, res);

    expect(AuditLogModel.create).toHaveBeenCalledWith({
      actorId: 'user42',
      action: 'UPDATE',
      targetResourceId: 'res42',
      targetResourceType: 'document',
      severity: 'warning',
      details: { field: 'name' },
      ipAddress: '10.0.0.5'
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        id: expect.stringMatching(/^audit_/),
        actorId: 'user42',
        action: 'UPDATE',
        targetResourceId: 'res42',
        targetResourceType: 'document',
        severity: 'info' // default overridden by mock data; ensure mock respects passed value
      })
    });
  });
});