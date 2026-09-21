import { jest } from '@jest/globals';
import {
  assignRoleToUser,
  revokeRoleFromUser,
  UserAccount,
  RoleDefinition
} from '../dataset/21_rbac_controller.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('assignRoleToUser', () => {
  test('should assign role successfully', async () => {
    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u1', roleName: 'editor', scope: 'project' }
    };
    const res = mockRes();

    jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({ name: 'editor' });
    jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 'u1', roles: [] });
    jest.spyOn(UserAccount, 'addRole').mockResolvedValue({ id: 'u1', roles: ['editor'] });

    await assignRoleToUser(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Role "editor" successfully granted to user',
      data: { userId: 'u1', roles: ['editor'], scope: 'project' }
    });
  });

  test('should forbid non‑admin requester', async () => {
    const req = { user: { role: 'user' }, body: {} };
    const res = mockRes();

    await assignRoleToUser(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Forbidden: Requires administrator privileges to assign roles'
    });
  });

  test('should return 400 when required params missing', async () => {
    const req = { user: { role: 'admin' }, body: { targetUserId: 'u1' } };
    const res = mockRes();

    await assignRoleToUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'targetUserId and roleName are required'
    });
  });

  test('should return 404 when role does not exist', async () => {
    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u1', roleName: 'unknown' }
    };
    const res = mockRes();

    jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue(null);

    await assignRoleToUser(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Role "unknown" does not exist in the system catalog'
    });
  });

  test('should return 404 when target user not found', async () => {
    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u2', roleName: 'editor' }
    };
    const res = mockRes();

    jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({ name: 'editor' });
    jest.spyOn(UserAccount, 'findById').mockResolvedValue(null);

    await assignRoleToUser(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User with ID u2 not found'
    });
  });

  test('should return 409 when user already has role', async () => {
    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u3', roleName: 'Editor' }
    };
    const res = mockRes();

    jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({ name: 'editor' });
    jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 'u3', roles: ['editor'] });

    await assignRoleToUser(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User already has the "editor" role'
    });
  });

  test('should forbid admin from assigning super_admin role', async () => {
    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u4', roleName: 'super_admin' }
    };
    const res = mockRes();

    await assignRoleToUser(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Only super_admin can assign the super_admin role'
    });
  });
});

describe('revokeRoleFromUser', () => {
  test('should revoke role successfully', async () => {
    const req = {
      user: { role: 'super_admin' },
      body: { targetUserId: 'u5', roleName: 'editor' }
    };
    const res = mockRes();

    jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 'u5', roles: ['editor'] });
    jest.spyOn(UserAccount, 'removeRole').mockResolvedValue({ id: 'u5', roles: [] });

    await revokeRoleFromUser(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Role "editor" successfully revoked from user',
      data: { userId: 'u5', roles: [] }
    });
  });

  test('should forbid non‑admin requester', async () => {
    const req = { user: { role: 'user' }, body: {} };
    const res = mockRes();

    await revokeRoleFromUser(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Forbidden: Requires administrator privileges to revoke roles'
    });
  });

  test('should return 400 when required params missing', async () => {
    const req = { user: { role: 'admin' }, body: { targetUserId: 'u6' } };
    const res = mockRes();

    await revokeRoleFromUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'targetUserId and roleName are required'
    });
  });

  test('should return 404 when target user not found', async () => {
    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u7', roleName: 'editor' }
    };
    const res = mockRes();

    jest.spyOn(UserAccount, 'findById').mockResolvedValue(null);

    await revokeRoleFromUser(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User with ID u7 not found'
    });
  });

  test('should return 400 when user does not possess the role', async () => {
    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u8', roleName: 'editor' }
    };
    const res = mockRes();

    jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 'u8', roles: [] });

    await revokeRoleFromUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User does not possess the "editor" role'
    });
  });

  test('should protect against revoking last super_admin', async () => {
    const req = {
      user: { role: 'super_admin' },
      body: { targetUserId: 'u9', roleName: 'super_admin' }
    };
    const res = mockRes();

    jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 'u9', roles: ['super_admin'] });
    jest.spyOn(UserAccount, 'countSuperAdmins').mockResolvedValue(1);

    await revokeRoleFromUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Cannot revoke the last remaining super_admin role in the system'
    });
  });

  test('should allow revoking super_admin when more than one exists', async () => {
    const req = {
      user: { role: 'super_admin' },
      body: { targetUserId: 'u10', roleName: 'super_admin' }
    };
    const res = mockRes();

    jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 'u10', roles: ['super_admin'] });
    jest.spyOn(UserAccount, 'countSuperAdmins').mockResolvedValue(2);
    jest.spyOn(UserAccount, 'removeRole').mockResolvedValue({ id: 'u10', roles: [] });

    await revokeRoleFromUser(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Role "super_admin" successfully revoked from user',
      data: { userId: 'u10', roles: [] }
    });
  });
});