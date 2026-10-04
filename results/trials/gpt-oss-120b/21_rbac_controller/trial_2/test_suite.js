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

describe('assignRoleToUser', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns 403 when requester is not admin or super_admin', async () => {
    const req = { user: { role: 'user' }, body: {} };
    const res = mockRes();

    await assignRoleToUser(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Forbidden: Requires administrator privileges to assign roles'
    });
  });

  test('returns 400 when required fields are missing', async () => {
    const req = { user: { role: 'admin' }, body: { targetUserId: 'u1' } };
    const res = mockRes();

    await assignRoleToUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'targetUserId and roleName are required'
    });
  });

  test('returns 403 when non‑super_admin tries to assign super_admin role', async () => {
    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u1', roleName: 'super_admin' }
    };
    const res = mockRes();

    await assignRoleToUser(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Only super_admin can assign the super_admin role'
    });
  });

  test('returns 404 when role does not exist', async () => {
    jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue(null);
    const req = {
      user: { role: 'super_admin' },
      body: { targetUserId: 'u1', roleName: 'manager' }
    };
    const res = mockRes();

    await assignRoleToUser(req, res);

    expect(RoleDefinition.findByName).toHaveBeenCalledWith('manager');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Role "manager" does not exist in the system catalog'
    });
  });

  test('returns 404 when target user is not found', async () => {
    jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({ name: 'editor' });
    jest.spyOn(UserAccount, 'findById').mockResolvedValue(null);
    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'missing', roleName: 'editor' }
    };
    const res = mockRes();

    await assignRoleToUser(req, res);

    expect(UserAccount.findById).toHaveBeenCalledWith('missing');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User with ID missing not found'
    });
  });

  test('returns 409 when user already has the role', async () => {
    jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({ name: 'viewer' });
    jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 'u2', roles: ['viewer'] });
    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u2', roleName: 'viewer' }
    };
    const res = mockRes();

    await assignRoleToUser(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User already has the "viewer" role'
    });
  });

  test('successfully assigns a role and returns 200', async () => {
    jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({ name: 'editor' });
    jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 'u3', roles: [] });
    jest.spyOn(UserAccount, 'addRole').mockResolvedValue({ id: 'u3', roles: ['editor'] });

    const req = {
      user: { role: 'super_admin' },
      body: { targetUserId: 'u3', roleName: 'Editor', scope: 'project' }
    };
    const res = mockRes();

    await assignRoleToUser(req, res);

    expect(UserAccount.addRole).toHaveBeenCalledWith('u3', 'editor', 'project');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Role "editor" successfully granted to user',
      data: {
        userId: 'u3',
        roles: ['editor'],
        scope: 'project'
      }
    });
  });
});

describe('revokeRoleFromUser', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns 403 when requester lacks admin privileges', async () => {
    const req = { user: { role: 'guest' }, body: {} };
    const res = mockRes();

    await revokeRoleFromUser(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Forbidden: Requires administrator privileges to revoke roles'
    });
  });

  test('returns 400 when required fields are missing', async () => {
    const req = { user: { role: 'admin' }, body: { targetUserId: 'u1' } };
    const res = mockRes();

    await revokeRoleFromUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'targetUserId and roleName are required'
    });
  });

  test('returns 404 when target user does not exist', async () => {
    jest.spyOn(UserAccount, 'findById').mockResolvedValue(null);
    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'nonexistent', roleName: 'editor' }
    };
    const res = mockRes();

    await revokeRoleFromUser(req, res);

    expect(UserAccount.findById).toHaveBeenCalledWith('nonexistent');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User with ID nonexistent not found'
    });
  });

  test('returns 400 when user does not possess the role', async () => {
    jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 'u4', roles: ['viewer'] });
    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u4', roleName: 'editor' }
    };
    const res = mockRes();

    await revokeRoleFromUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User does not possess the "editor" role'
    });
  });

  test('prevents revoking the last super_admin', async () => {
    jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 'u5', roles: ['super_admin'] });
    jest.spyOn(UserAccount, 'countSuperAdmins').mockResolvedValue(1);
    const req = {
      user: { role: 'super_admin' },
      body: { targetUserId: 'u5', roleName: 'super_admin' }
    };
    const res = mockRes();

    await revokeRoleFromUser(req, res);

    expect(UserAccount.countSuperAdmins).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Cannot revoke the last remaining super_admin role in the system'
    });
  });

  test('successfully revokes a role and returns 200', async () => {
    jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 'u6', roles: ['editor'] });
    jest.spyOn(UserAccount, 'removeRole').mockResolvedValue({ id: 'u6', roles: [] });

    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u6', roleName: 'Editor' }
    };
    const res = mockRes();

    await revokeRoleFromUser(req, res);

    expect(UserAccount.removeRole).toHaveBeenCalledWith('u6', 'editor');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Role "editor" successfully revoked from user',
      data: {
        userId: 'u6',
        roles: []
      }
    });
  });
});