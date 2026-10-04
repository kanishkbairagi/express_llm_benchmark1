import { jest } from '@jest/globals';
import {
  assignRoleToUser,
  revokeRoleFromUser,
  UserAccount,
  RoleDefinition,
} from '../dataset/21_rbac_controller.js';

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('assignRoleToUser', () => {
  const originalFindById = UserAccount.findById;
  const originalAddRole = UserAccount.addRole;
  const originalFindByName = RoleDefinition.findByName;

  beforeEach(() => {
    jest.clearAllMocks();
    UserAccount.findById = jest.fn();
    UserAccount.addRole = jest.fn();
    RoleDefinition.findByName = jest.fn();
  });

  afterAll(() => {
    // Restore original implementations
    UserAccount.findById = originalFindById;
    UserAccount.addRole = originalAddRole;
    RoleDefinition.findByName = originalFindByName;
  });

  test('rejects when requester is not admin or super_admin', async () => {
    const req = { user: { role: 'user' }, body: {} };
    const res = mockResponse();

    await assignRoleToUser(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Forbidden: Requires administrator privileges to assign roles',
    });
  });

  test('rejects when required fields are missing', async () => {
    const req = { user: { role: 'admin' }, body: { targetUserId: 'u1' } };
    const res = mockResponse();

    await assignRoleToUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'targetUserId and roleName are required',
    });
  });

  test('rejects assigning super_admin role by non‑super_admin', async () => {
    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u1', roleName: 'super_admin' },
    };
    const res = mockResponse();

    await assignRoleToUser(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Only super_admin can assign the super_admin role',
    });
  });

  test('rejects when role does not exist in catalog', async () => {
    RoleDefinition.findByName.mockResolvedValue(null);
    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u1', roleName: 'manager' },
    };
    const res = mockResponse();

    await assignRoleToUser(req, res);

    expect(RoleDefinition.findByName).toHaveBeenCalledWith('manager');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Role "manager" does not exist in the system catalog',
    });
  });

  test('rejects when target user is not found', async () => {
    RoleDefinition.findByName.mockResolvedValue({ name: 'editor' });
    UserAccount.findById.mockResolvedValue(null);

    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'missing', roleName: 'editor' },
    };
    const res = mockResponse();

    await assignRoleToUser(req, res);

    expect(UserAccount.findById).toHaveBeenCalledWith('missing');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User with ID missing not found',
    });
  });

  test('rejects when user already possesses the role', async () => {
    RoleDefinition.findByName.mockResolvedValue({ name: 'viewer' });
    UserAccount.findById.mockResolvedValue({ id: 'u2', roles: ['viewer'] });

    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u2', roleName: 'viewer' },
    };
    const res = mockResponse();

    await assignRoleToUser(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User already has the "viewer" role',
    });
  });

  test('successfully grants a role', async () => {
    RoleDefinition.findByName.mockResolvedValue({ name: 'editor' });
    UserAccount.findById.mockResolvedValue({ id: 'u3', roles: [] });
    UserAccount.addRole.mockResolvedValue({ id: 'u3', roles: ['editor'] });

    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u3', roleName: 'Editor', scope: 'project' },
    };
    const res = mockResponse();

    await assignRoleToUser(req, res);

    expect(UserAccount.addRole).toHaveBeenCalledWith('u3', 'editor', 'project');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Role "editor" successfully granted to user',
      data: {
        userId: 'u3',
        roles: ['editor'],
        scope: 'project',
      },
    });
  });
});

describe('revokeRoleFromUser', () => {
  const originalFindById = UserAccount.findById;
  const originalRemoveRole = UserAccount.removeRole;
  const originalCountSuperAdmins = UserAccount.countSuperAdmins;

  beforeEach(() => {
    jest.clearAllMocks();
    UserAccount.findById = jest.fn();
    UserAccount.removeRole = jest.fn();
    UserAccount.countSuperAdmins = jest.fn();
  });

  afterAll(() => {
    UserAccount.findById = originalFindById;
    UserAccount.removeRole = originalRemoveRole;
    UserAccount.countSuperAdmins = originalCountSuperAdmins;
  });

  test('rejects when requester lacks admin privileges', async () => {
    const req = { user: { role: 'member' }, body: {} };
    const res = mockResponse();

    await revokeRoleFromUser(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Forbidden: Requires administrator privileges to revoke roles',
    });
  });

  test('rejects when required fields are missing', async () => {
    const req = { user: { role: 'admin' }, body: { targetUserId: 'u1' } };
    const res = mockResponse();

    await revokeRoleFromUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'targetUserId and roleName are required',
    });
  });

  test('rejects when target user does not exist', async () => {
    UserAccount.findById.mockResolvedValue(null);
    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'unknown', roleName: 'editor' },
    };
    const res = mockResponse();

    await revokeRoleFromUser(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User with ID unknown not found',
    });
  });

  test('rejects when user does not have the specified role', async () => {
    UserAccount.findById.mockResolvedValue({ id: 'u5', roles: ['viewer'] });

    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u5', roleName: 'editor' },
    };
    const res = mockResponse();

    await revokeRoleFromUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User does not possess the "editor" role',
    });
  });

  test('prevents revoking the last super_admin', async () => {
    UserAccount.findById.mockResolvedValue({ id: 'u6', roles: ['super_admin'] });
    UserAccount.countSuperAdmins.mockResolvedValue(1);

    const req = {
      user: { role: 'super_admin' },
      body: { targetUserId: 'u6', roleName: 'super_admin' },
    };
    const res = mockResponse();

    await revokeRoleFromUser(req, res);

    expect(UserAccount.countSuperAdmins).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Cannot revoke the last remaining super_admin role in the system',
    });
  });

  test('successfully revokes a role', async () => {
    UserAccount.findById.mockResolvedValue({ id: 'u7', roles: ['editor'] });
    UserAccount.removeRole.mockResolvedValue({ id: 'u7', roles: [] });

    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u7', roleName: 'Editor' },
    };
    const res = mockResponse();

    await revokeRoleFromUser(req, res);

    expect(UserAccount.removeRole).toHaveBeenCalledWith('u7', 'editor');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Role "editor" successfully revoked from user',
      data: {
        userId: 'u7',
        roles: [],
      },
    });
  });
});