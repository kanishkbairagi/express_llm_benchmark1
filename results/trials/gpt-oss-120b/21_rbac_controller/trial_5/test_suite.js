import { jest } from '@jest/globals';
import {
  assignRoleToUser,
  revokeRoleFromUser,
  UserAccount,
  RoleDefinition
} from '../dataset/21_rbac_controller.js';

describe('assignRoleToUser', () => {
  const makeRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('rejects when requester is not admin or super_admin', async () => {
    const req = { user: { role: 'user' }, body: {} };
    const res = makeRes();

    await assignRoleToUser(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Forbidden: Requires administrator privileges to assign roles'
    });
  });

  test('rejects when required fields are missing', async () => {
    const req = { user: { role: 'admin' }, body: { targetUserId: null, roleName: null } };
    const res = makeRes();

    await assignRoleToUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'targetUserId and roleName are required'
    });
  });

  test('rejects super_admin assignment by non‑super_admin', async () => {
    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u1', roleName: 'super_admin' }
    };
    const res = makeRes();

    await assignRoleToUser(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Only super_admin can assign the super_admin role'
    });
  });

  test('rejects when role does not exist', async () => {
    jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue(null);
    const req = {
      user: { role: 'super_admin' },
      body: { targetUserId: 'u1', roleName: 'nonexistent' }
    };
    const res = makeRes();

    await assignRoleToUser(req, res);

    expect(RoleDefinition.findByName).toHaveBeenCalledWith('nonexistent');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Role "nonexistent" does not exist in the system catalog'
    });
  });

  test('rejects when target user is not found', async () => {
    jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({ name: 'editor' });
    jest.spyOn(UserAccount, 'findById').mockResolvedValue(null);

    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'missing', roleName: 'editor' }
    };
    const res = makeRes();

    await assignRoleToUser(req, res);

    expect(UserAccount.findById).toHaveBeenCalledWith('missing');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User with ID missing not found'
    });
  });

  test('rejects when user already has the role', async () => {
    jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({ name: 'editor' });
    jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 'u2', roles: ['editor'] });

    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u2', roleName: 'EDITOR' }
    };
    const res = makeRes();

    await assignRoleToUser(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User already has the "editor" role'
    });
  });

  test('successfully assigns a role', async () => {
    jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({ name: 'viewer' });
    jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 'u3', roles: [] });
    jest.spyOn(UserAccount, 'addRole').mockResolvedValue({ id: 'u3', roles: ['viewer'] });

    const req = {
      user: { role: 'super_admin' },
      body: { targetUserId: 'u3', roleName: 'Viewer', scope: 'project' }
    };
    const res = makeRes();

    await assignRoleToUser(req, res);

    expect(UserAccount.addRole).toHaveBeenCalledWith('u3', 'viewer', 'project');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Role "viewer" successfully granted to user',
      data: {
        userId: 'u3',
        roles: ['viewer'],
        scope: 'project'
      }
    });
  });
});

describe('revokeRoleFromUser', () => {
  const makeRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('rejects when requester lacks admin privileges', async () => {
    const req = { user: { role: 'guest' }, body: {} };
    const res = makeRes();

    await revokeRoleFromUser(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Forbidden: Requires administrator privileges to revoke roles'
    });
  });

  test('rejects when required fields are missing', async () => {
    const req = { user: { role: 'admin' }, body: {} };
    const res = makeRes();

    await revokeRoleFromUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'targetUserId and roleName are required'
    });
  });

  test('rejects when target user does not exist', async () => {
    jest.spyOn(UserAccount, 'findById').mockResolvedValue(null);

    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'unknown', roleName: 'editor' }
    };
    const res = makeRes();

    await revokeRoleFromUser(req, res);

    expect(UserAccount.findById).toHaveBeenCalledWith('unknown');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User with ID unknown not found'
    });
  });

  test('rejects when user does not possess the role', async () => {
    jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 'u4', roles: ['viewer'] });

    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u4', roleName: 'editor' }
    };
    const res = makeRes();

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
    const res = makeRes();

    await revokeRoleFromUser(req, res);

    expect(UserAccount.countSuperAdmins).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Cannot revoke the last remaining super_admin role in the system'
    });
  });

  test('successfully revokes a role', async () => {
    jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 'u6', roles: ['editor'] });
    jest.spyOn(UserAccount, 'removeRole').mockResolvedValue({ id: 'u6', roles: [] });

    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u6', roleName: 'Editor' }
    };
    const res = makeRes();

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