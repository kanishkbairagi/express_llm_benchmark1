import { jest } from '@jest/globals';
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
  });

  test('returns 403 when user is not admin or auditor', async () => {
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
    const req = { user: { role: 'admin' }, query: { page: '0', limit: '200' } };
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
      query: { action: 'invalid_action' }
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
      query: { severity: 'high' }
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

  test('successful retrieval with pagination calculation', async () => {
    const fakeLogs = [{ id: 'log1' }, { id: 'log2' }];
    jest.spyOn(AuditLogModel, 'findWithFilters').mockResolvedValue({
      total: 45,
      logs: fakeLogs
    });

    const req = {
      user: { role: 'admin' },
      query: { page: '2', limit: '20' }
    };
    const res = mockResponse();

    await getAuditLogs(req, res);

    expect(AuditLogModel.findWithFilters).toHaveBeenCalledWith(
      {},
      { skip: 20, limit: 20 }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        total: 45,
        page: 2,
        totalPages: 3,
        logs: fakeLogs
      }
    });
  });

  test('returns totalPages = 1 when total is 0', async () => {
    jest.spyOn(AuditLogModel, 'findWithFilters').mockResolvedValue({
      total: 0,
      logs: []
    });

    const req = {
      user: { role: 'auditor' },
      query: {}
    };
    const res = mockResponse();

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
});

describe('createAuditEntry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when required fields are missing', async () => {
    const req = { user: { id: 'u1' }, body: { action: 'login' } };
    const res = mockResponse();

    await createAuditEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'action, targetResourceId, and targetResourceType are required'
    });
  });

  test('returns 400 for invalid action', async () => {
    const req = {
      user: { id: 'u2' },
      body: {
        action: 'unknown',
        targetResourceId: 'r1',
        targetResourceType: 'typeA'
      }
    };
    const res = mockResponse();

    await createAuditEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: expect.stringContaining('Invalid action')
    });
  });

  test('returns 400 for invalid severity', async () => {
    const req = {
      user: { id: 'u3' },
      body: {
        action: 'login',
        targetResourceId: 'r2',
        targetResourceType: 'typeB',
        severity: 'high'
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

  test('successful creation uses defaults and transforms data', async () => {
    const fakeEntry = {
      id: 'audit_123',
      actorId: 'system',
      action: 'LOGIN',
      targetResourceId: 'r3',
      targetResourceType: 'typeC',
      severity: 'info',
      details: { foo: 'bar' },
      ipAddress: '127.0.0.1',
      timestamp: new Date()
    };
    jest.spyOn(AuditLogModel, 'create').mockResolvedValue(fakeEntry);

    const req = {
      user: null, // simulate missing user, fallback to 'system'
      ip: undefined,
      headers: {},
      body: {
        action: 'login',
        targetResourceId: 'r3',
        targetResourceType: 'typeC',
        details: { foo: 'bar' },
        severity: 'INFO' // mixed case to test normalization
      }
    };
    const res = mockResponse();

    await createAuditEntry(req, res);

    expect(AuditLogModel.create).toHaveBeenCalledWith({
      actorId: 'system',
      action: 'LOGIN',
      targetResourceId: 'r3',
      targetResourceType: 'typeC',
      severity: 'info',
      details: { foo: 'bar' },
      ipAddress: '127.0.0.1'
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: fakeEntry
    });
  });

  test('uses request IP when provided', async () => {
    const fakeEntry = { id: 'audit_456' };
    jest.spyOn(AuditLogModel, 'create').mockResolvedValue(fakeEntry);

    const req = {
      user: { id: 'u99' },
      ip: '10.0.0.5',
      headers: {},
      body: {
        action: 'delete',
        targetResourceId: 'r99',
        targetResourceType: 'typeZ'
      }
    };
    const res = mockResponse();

    await createAuditEntry(req, res);

    expect(AuditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ ipAddress: '10.0.0.5', actorId: 'u99' })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});