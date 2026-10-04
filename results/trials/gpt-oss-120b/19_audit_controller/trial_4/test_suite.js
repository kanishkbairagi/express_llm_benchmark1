import { jest } from '@jest/globals';
import {
  getAuditLogs,
  createAuditEntry,
  AuditLogModel
} from '../dataset/19_audit_controller.js';

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('getAuditLogs', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('returns 403 when user is not admin or auditor', async () => {
    const req = { user: { role: 'user' }, query: {} };
    const res = createMockRes();

    await getAuditLogs(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Access denied: Requires administrator or auditor privileges'
    });
  });

  test('returns 400 for invalid pagination parameters', async () => {
    const req = {
      user: { role: 'admin' },
      query: { page: '0', limit: '200' }
    };
    const res = createMockRes();

    await getAuditLogs(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Pagination parameters must be positive integers (limit <= 100)'
    });
  });

  test('returns 400 for invalid action filter', async () => {
    const req = {
      user: { role: 'auditor' },
      query: { action: 'invalid_action' }
    };
    const res = createMockRes();

    await getAuditLogs(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: `Invalid action filter. Allowed: ${['LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'PERMISSION_CHANGE'].join(', ')}`
    });
  });

  test('returns 400 for invalid severity filter', async () => {
    const req = {
      user: { role: 'admin' },
      query: { severity: 'high' }
    };
    const res = createMockRes();

    await getAuditLogs(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: `Invalid severity filter. Allowed: ${['info', 'warning', 'critical'].join(', ')}`
    });
  });

  test('returns 400 for malformed startDate', async () => {
    const req = {
      user: { role: 'admin' },
      query: { startDate: 'not-a-date' }
    };
    const res = createMockRes();

    await getAuditLogs(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid startDate format'
    });
  });

  test('returns 200 with correct pagination data', async () => {
    const mockFind = jest
      .spyOn(AuditLogModel, 'findWithFilters')
      .mockResolvedValue({
        total: 45,
        logs: [{ id: 'log1' }, { id: 'log2' }]
      });

    const req = {
      user: { role: 'admin' },
      query: { page: '2', limit: '20' }
    };
    const res = createMockRes();

    await getAuditLogs(req, res);

    expect(mockFind).toHaveBeenCalledWith(
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
        logs: [{ id: 'log1' }, { id: 'log2' }]
      }
    });
  });
});

describe('createAuditEntry', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when required fields are missing', async () => {
    const req = {
      user: { id: 'user123' },
      body: { action: 'CREATE' } // missing targetResourceId and targetResourceType
    };
    const res = createMockRes();

    await createAuditEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'action, targetResourceId, and targetResourceType are required'
    });
  });

  test('returns 400 for invalid action', async () => {
    const req = {
      user: { id: 'user123' },
      body: {
        action: 'invalid',
        targetResourceId: 'res1',
        targetResourceType: 'typeA'
      }
    };
    const res = createMockRes();

    await createAuditEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: `Invalid action. Allowed: ${['LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'PERMISSION_CHANGE'].join(', ')}`
    });
  });

  test('returns 400 for invalid severity level', async () => {
    const req = {
      user: { id: 'user123' },
      body: {
        action: 'UPDATE',
        targetResourceId: 'res1',
        targetResourceType: 'typeA',
        severity: 'high'
      }
    };
    const res = createMockRes();

    await createAuditEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: `Invalid severity level. Allowed: ${['info', 'warning', 'critical'].join(', ')}`
    });
  });

  test('returns 201 with created log entry', async () => {
    const fakeEntry = {
      id: 'audit_12345',
      actorId: 'user123',
      action: 'DELETE',
      targetResourceId: 'res1',
      targetResourceType: 'typeA',
      severity: 'warning',
      details: { foo: 'bar' },
      ipAddress: '127.0.0.1',
      timestamp: new Date()
    };

    const mockCreate = jest
      .spyOn(AuditLogModel, 'create')
      .mockResolvedValue(fakeEntry);

    const req = {
      user: { id: 'user123' },
      ip: '10.0.0.5',
      body: {
        action: 'delete',
        targetResourceId: 'res1',
        targetResourceType: 'typeA',
        severity: 'warning',
        details: { foo: 'bar' }
      }
    };
    const res = createMockRes();

    await createAuditEntry(req, res);

    expect(mockCreate).toHaveBeenCalledWith({
      actorId: 'user123',
      action: 'DELETE',
      targetResourceId: 'res1',
      targetResourceType: 'typeA',
      severity: 'warning',
      details: { foo: 'bar' },
      ipAddress: '10.0.0.5'
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: fakeEntry
    });
  });
});