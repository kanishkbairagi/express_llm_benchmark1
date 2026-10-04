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
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('returns 400 when required fields are missing', async () => {
    const req = { user: { role: 'admin' }, body: { targetUserId: '123' } };
    const res = mockRes();

    await assignRoleToUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('returns 403 when admin tries to assign super_admin role', async () => {
    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u1', roleName: 'super_admin' }
    };
    const res = mockRes();

    await assignRoleToUser(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('returns 404 when role does not exist', async () => {
    jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue(null);
    const req = {
      user: { role: 'super_admin' },
      body: { targetUserId: 'u1', roleName: 'nonexistent' }
    };
    const res = mockRes();

    await assignRoleToUser(req, res);

    expect(RoleDefinition.findByName).toHaveBeenCalledWith('nonexistent');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('returns 404 when target user is not found', async () => {
    jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({});
    jest.spyOn(UserAccount, 'findById').mockResolvedValue(null);
    const req = {
      user: { role: 'super_admin' },
      body: { targetUserId: 'missing', roleName: 'editor' }
    };
    const res = mockRes();

    await assignRoleToUser(req, res);

    expect(UserAccount.findById).toHaveBeenCalledWith('missing');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('returns 409 when user already has the role', async () => {
    jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({});
    jest.spyOn(UserAccount, 'findById').mockResolvedValue({
      id: 'u1',
      roles: ['editor']
    });
    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u1', roleName: 'editor' }
    };
    const res = mockRes();

    await assignRoleToUser(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('successfully assigns a role', async () => {
    jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({});
    jest.spyOn(UserAccount, 'findById').mockResolvedValue({
      id: 'u1',
      roles: []
    });
    jest.spyOn(UserAccount, 'addRole').mockResolvedValue({
      id: 'u1',
      roles: ['editor']
    });

    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u1', roleName: 'EDITOR', scope: 'project' }
    };
    const res = mockRes();

    await assignRoleToUser(req, res);

    expect(UserAccount.addRole).toHaveBeenCalledWith('u1', 'editor', 'project');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: { userId: 'u1', roles: ['editor'], scope: 'project' }
      })
    );
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
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('returns 400 when required fields are missing', async () => {
    const req = { user: { role: 'admin' }, body: { targetUserId: 'u1' } };
    const res = mockRes();

    await revokeRoleFromUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('returns 404 when target user does not exist', async () => {
    jest.spyOn(UserAccount, 'findById').mockResolvedValue(null);
    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'missing', roleName: 'editor' }
    };
    const res = mockRes();

    await revokeRoleFromUser(req, res);

    expect(UserAccount.findById).toHaveBeenCalledWith('missing');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('returns 400 when user does not possess the role', async () => {
    jest.spyOn(UserAccount, 'findById').mockResolvedValue({
      id: 'u1',
      roles: ['viewer']
    });
    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u1', roleName: 'editor' }
    };
    const res = mockRes();

    await revokeRoleFromUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('prevents revoking last super_admin', async () => {
    jest.spyOn(UserAccount, 'findById').mockResolvedValue({
      id: 'u1',
      roles: ['super_admin']
    });
    jest.spyOn(UserAccount, 'countSuperAdmins').mockResolvedValue(1);
    const req = {
      user: { role: 'super_admin' },
      body: { targetUserId: 'u1', roleName: 'super_admin' }
    };
    const res = mockRes();

    await revokeRoleFromUser(req, res);

    expect(UserAccount.countSuperAdmins).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('successfully revokes a role', async () => {
    jest.spyOn(UserAccount, 'findById').mockResolvedValue({
      id: 'u1',
      roles: ['editor']
    });
    jest.spyOn(UserAccount, 'removeRole').mockResolvedValue({
      id: 'u1',
      roles: []
    });

    const req = {
      user: { role: 'admin' },
      body: { targetUserId: 'u1', roleName: 'Editor' }
    };
    const res = mockRes();

    await revokeRoleFromUser(req, res);

    expect(UserAccount.removeRole).toHaveBeenCalledWith('u1', 'editor');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: { userId: 'u1', roles: [] }
      })
    );
  });
});