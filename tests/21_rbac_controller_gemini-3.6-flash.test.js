import { jest } from '@jest/globals';
import {
  assignRoleToUser,
  revokeRoleFromUser,
  UserAccount,
  RoleDefinition
} from '../dataset/21_rbac_controller.js';

describe('RBAC Controller Unit Tests', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      user: null,
      body: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  describe('assignRoleToUser', () => {
    test('should return 403 if requester is missing', async () => {
      req.user = null;

      await assignRoleToUser(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Forbidden: Requires administrator privileges to assign roles'
      });
    });

    test('should return 403 if requester role is neither admin nor super_admin', async () => {
      req.user = { role: 'editor' };

      await assignRoleToUser(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Forbidden: Requires administrator privileges to assign roles'
      });
    });

    test('should return 400 if targetUserId or roleName is missing', async () => {
      req.user = { role: 'admin' };
      req.body = { targetUserId: 'user_123' }; // missing roleName

      await assignRoleToUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'targetUserId and roleName are required'
      });
    });

    test('should return 403 if non-super_admin tries to assign super_admin role', async () => {
      req.user = { role: 'admin' };
      req.body = { targetUserId: 'user_123', roleName: 'SUPER_ADMIN' };

      await assignRoleToUser(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Only super_admin can assign the super_admin role'
      });
    });

    test('should return 404 if role does not exist in RoleDefinition', async () => {
      req.user = { role: 'admin' };
      req.body = { targetUserId: 'user_123', roleName: 'invalid_role' };
      jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue(null);

      await assignRoleToUser(req, res);

      expect(RoleDefinition.findByName).toHaveBeenCalledWith('invalid_role');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Role "invalid_role" does not exist in the system catalog'
      });
    });

    test('should return 404 if target user is not found', async () => {
      req.user = { role: 'admin' };
      req.body = { targetUserId: 'user_999', roleName: 'editor' };
      jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({ name: 'editor' });
      jest.spyOn(UserAccount, 'findById').mockResolvedValue(null);

      await assignRoleToUser(req, res);

      expect(UserAccount.findById).toHaveBeenCalledWith('user_999');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'User with ID user_999 not found'
      });
    });

    test('should return 409 if target user already possesses the role', async () => {
      req.user = { role: 'admin' };
      req.body = { targetUserId: 'user_123', roleName: 'EDITOR ' };
      jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({ name: 'editor' });
      jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 'user_123', roles: ['editor'] });

      await assignRoleToUser(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'User already has the "editor" role'
      });
    });

    test('should assign role successfully and return 200 with default global scope', async () => {
      req.user = { role: 'admin' };
      req.body = { targetUserId: 'user_123', roleName: 'editor' };
      jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({ name: 'editor' });
      jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 'user_123', roles: [] });
      jest.spyOn(UserAccount, 'addRole').mockResolvedValue({ id: 'user_123', roles: ['editor'] });

      await assignRoleToUser(req, res);

      expect(UserAccount.addRole).toHaveBeenCalledWith('user_123', 'editor', 'global');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Role "editor" successfully granted to user',
        data: {
          userId: 'user_123',
          roles: ['editor'],
          scope: 'global'
        }
      });
    });

    test('should assign super_admin role when requester is super_admin with custom scope', async () => {
      req.user = { role: 'super_admin' };
      req.body = { targetUserId: 'user_123', roleName: 'super_admin', scope: 'regional' };
      jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({ name: 'super_admin' });
      jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 'user_123', roles: [] });
      jest.spyOn(UserAccount, 'addRole').mockResolvedValue({ id: 'user_123', roles: ['super_admin'] });

      await assignRoleToUser(req, res);

      expect(UserAccount.addRole).toHaveBeenCalledWith('user_123', 'super_admin', 'regional');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Role "super_admin" successfully granted to user',
        data: {
          userId: 'user_123',
          roles: ['super_admin'],
          scope: 'regional'
        }
      });
    });

    test('should handle internal errors and return 500', async () => {
      req.user = { role: 'admin' };
      req.body = { targetUserId: 'user_123', roleName: 'editor' };
      jest.spyOn(RoleDefinition, 'findByName').mockRejectedValue(new Error('Database connection failed'));

      await assignRoleToUser(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to assign role',
        details: 'Database connection failed'
      });
    });
  });

  describe('revokeRoleFromUser', () => {
    test('should return 403 if requester is missing', async () => {
      req.user = null;

      await revokeRoleFromUser(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Forbidden: Requires administrator privileges to revoke roles'
      });
    });

    test('should return 403 if requester role is not privileged', async () => {
      req.user = { role: 'viewer' };

      await revokeRoleFromUser(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Forbidden: Requires administrator privileges to revoke roles'
      });
    });

    test('should return 400 if targetUserId or roleName is missing', async () => {
      req.user = { role: 'admin' };
      req.body = { roleName: 'editor' }; // missing targetUserId

      await revokeRoleFromUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'targetUserId and roleName are required'
      });
    });

    test('should return 404 if target user is not found', async () => {
      req.user = { role: 'admin' };
      req.body = { targetUserId: 'user_999', roleName: 'editor' };
      jest.spyOn(UserAccount, 'findById').mockResolvedValue(null);

      await revokeRoleFromUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'User with ID user_999 not found'
      });
    });

    test('should return 400 if user does not possess the role to revoke', async () => {
      req.user = { role: 'admin' };
      req.body = { targetUserId: 'user_123', roleName: 'editor' };
      jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 'user_123', roles: ['viewer'] });

      await revokeRoleFromUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'User does not possess the "editor" role'
      });
    });

    test('should return 400 if attempting to revoke the last remaining super_admin', async () => {
      req.user = { role: 'super_admin' };
      req.body = { targetUserId: 'user_123', roleName: 'SUPER_ADMIN' };
      jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 'user_123', roles: ['super_admin'] });
      jest.spyOn(UserAccount, 'countSuperAdmins').mockResolvedValue(1);

      await revokeRoleFromUser(req, res);

      expect(UserAccount.countSuperAdmins).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Cannot revoke the last remaining super_admin role in the system'
      });
    });

    test('should revoke super_admin role if countSuperAdmins is greater than 1', async () => {
      req.user = { role: 'super_admin' };
      req.body = { targetUserId: 'user_123', roleName: 'super_admin' };
      jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 'user_123', roles: ['super_admin'] });
      jest.spyOn(UserAccount, 'countSuperAdmins').mockResolvedValue(2);
      jest.spyOn(UserAccount, 'removeRole').mockResolvedValue({ id: 'user_123', roles: [] });

      await revokeRoleFromUser(req, res);

      expect(UserAccount.removeRole).toHaveBeenCalledWith('user_123', 'super_admin');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Role "super_admin" successfully revoked from user',
        data: {
          userId: 'user_123',
          roles: []
        }
      });
    });

    test('should revoke standard role successfully and return 200', async () => {
      req.user = { role: 'admin' };
      req.body = { targetUserId: 'user_123', roleName: 'editor ' };
      jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 'user_123', roles: ['editor', 'viewer'] });
      jest.spyOn(UserAccount, 'removeRole').mockResolvedValue({ id: 'user_123', roles: ['viewer'] });

      await revokeRoleFromUser(req, res);

      expect(UserAccount.removeRole).toHaveBeenCalledWith('user_123', 'editor');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Role "editor" successfully revoked from user',
        data: {
          userId: 'user_123',
          roles: ['viewer']
        }
      });
    });

    test('should handle internal errors and return 500', async () => {
      req.user = { role: 'admin' };
      req.body = { targetUserId: 'user_123', roleName: 'editor' };
      jest.spyOn(UserAccount, 'findById').mockRejectedValue(new Error('Database failure'));

      await revokeRoleFromUser(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to revoke role',
        details: 'Database failure'
      });
    });
  });
});