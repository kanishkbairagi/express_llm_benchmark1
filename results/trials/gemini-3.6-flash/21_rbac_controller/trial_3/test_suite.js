import { jest } from '@jest/globals';
import {
  assignRoleToUser,
  revokeRoleFromUser,
  UserAccount,
  RoleDefinition
} from '../dataset/21_rbac_controller.js';

describe('RBAC Controller', () => {
  let mockRes;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('assignRoleToUser', () => {
    it('should return 403 if requester is missing or does not have admin privileges', async () => {
      const req1 = {};
      await assignRoleToUser(req1, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Forbidden: Requires administrator privileges to assign roles'
      });

      const req2 = { user: { role: 'editor' } };
      await assignRoleToUser(req2, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it('should return 400 if targetUserId or roleName is missing', async () => {
      const req = {
        user: { role: 'admin' },
        body: { targetUserId: 'user-1' }
      };

      await assignRoleToUser(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'targetUserId and roleName are required'
      });
    });

    it('should return 403 if an admin attempts to assign super_admin role', async () => {
      const req = {
        user: { role: 'admin' },
        body: { targetUserId: 'user-1', roleName: 'SUPER_ADMIN' }
      };

      await assignRoleToUser(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Only super_admin can assign the super_admin role'
      });
    });

    it('should return 404 if the role does not exist in RoleDefinition catalog', async () => {
      jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue(null);

      const req = {
        user: { role: 'admin' },
        body: { targetUserId: 'user-1', roleName: 'non_existent_role' }
      };

      await assignRoleToUser(req, mockRes);

      expect(RoleDefinition.findByName).toHaveBeenCalledWith('non_existent_role');
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Role "non_existent_role" does not exist in the system catalog'
      });
    });

    it('should return 404 if the target user is not found', async () => {
      jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({ name: 'editor' });
      jest.spyOn(UserAccount, 'findById').mockResolvedValue(null);

      const req = {
        user: { role: 'admin' },
        body: { targetUserId: 'user-99', roleName: 'editor' }
      };

      await assignRoleToUser(req, mockRes);

      expect(UserAccount.findById).toHaveBeenCalledWith('user-99');
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'User with ID user-99 not found'
      });
    });

    it('should return 409 if user already has the requested role', async () => {
      jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({ name: 'editor' });
      jest.spyOn(UserAccount, 'findById').mockResolvedValue({
        id: 'user-1',
        roles: ['editor', 'viewer']
      });

      const req = {
        user: { role: 'admin' },
        body: { targetUserId: 'user-1', roleName: 'EDITOR' }
      };

      await assignRoleToUser(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'User already has the "editor" role'
      });
    });

    it('should successfully assign role and return 200 with default scope', async () => {
      jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({ name: 'editor' });
      jest.spyOn(UserAccount, 'findById').mockResolvedValue({
        id: 'user-1',
        roles: ['viewer']
      });
      jest.spyOn(UserAccount, 'addRole').mockResolvedValue({
        id: 'user-1',
        roles: ['viewer', 'editor']
      });

      const req = {
        user: { role: 'admin' },
        body: { targetUserId: 'user-1', roleName: 'editor' }
      };

      await assignRoleToUser(req, mockRes);

      expect(UserAccount.addRole).toHaveBeenCalledWith('user-1', 'editor', 'global');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Role "editor" successfully granted to user',
        data: {
          userId: 'user-1',
          roles: ['viewer', 'editor'],
          scope: 'global'
        }
      });
    });

    it('should successfully assign super_admin role when requested by super_admin', async () => {
      jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({ name: 'super_admin' });
      jest.spyOn(UserAccount, 'findById').mockResolvedValue({
        id: 'user-1',
        roles: []
      });
      jest.spyOn(UserAccount, 'addRole').mockResolvedValue({
        id: 'user-1',
        roles: ['super_admin']
      });

      const req = {
        user: { role: 'super_admin' },
        body: { targetUserId: 'user-1', roleName: 'super_admin', scope: 'custom-scope' }
      };

      await assignRoleToUser(req, mockRes);

      expect(UserAccount.addRole).toHaveBeenCalledWith('user-1', 'super_admin', 'custom-scope');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Role "super_admin" successfully granted to user',
        data: {
          userId: 'user-1',
          roles: ['super_admin'],
          scope: 'custom-scope'
        }
      });
    });

    it('should return 500 when an exception is thrown', async () => {
      jest.spyOn(RoleDefinition, 'findByName').mockRejectedValue(new Error('Database error'));

      const req = {
        user: { role: 'admin' },
        body: { targetUserId: 'user-1', roleName: 'editor' }
      };

      await assignRoleToUser(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to assign role',
        details: 'Database error'
      });
    });
  });

  describe('revokeRoleFromUser', () => {
    it('should return 403 if requester lacks administrator privileges', async () => {
      const req = {
        user: { role: 'user' },
        body: { targetUserId: 'user-1', roleName: 'editor' }
      };

      await revokeRoleFromUser(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Forbidden: Requires administrator privileges to revoke roles'
      });
    });

    it('should return 400 if targetUserId or roleName is missing', async () => {
      const req = {
        user: { role: 'admin' },
        body: { roleName: 'editor' }
      };

      await revokeRoleFromUser(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'targetUserId and roleName are required'
      });
    });

    it('should return 404 if user is not found', async () => {
      jest.spyOn(UserAccount, 'findById').mockResolvedValue(null);

      const req = {
        user: { role: 'admin' },
        body: { targetUserId: 'user-99', roleName: 'editor' }
      };

      await revokeRoleFromUser(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'User with ID user-99 not found'
      });
    });

    it('should return 400 if user does not possess the role', async () => {
      jest.spyOn(UserAccount, 'findById').mockResolvedValue({
        id: 'user-1',
        roles: ['viewer']
      });

      const req = {
        user: { role: 'admin' },
        body: { targetUserId: 'user-1', roleName: 'editor' }
      };

      await revokeRoleFromUser(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'User does not possess the "editor" role'
      });
    });

    it('should return 400 if trying to revoke the last remaining super_admin role', async () => {
      jest.spyOn(UserAccount, 'findById').mockResolvedValue({
        id: 'user-1',
        roles: ['super_admin']
      });
      jest.spyOn(UserAccount, 'countSuperAdmins').mockResolvedValue(1);

      const req = {
        user: { role: 'super_admin' },
        body: { targetUserId: 'user-1', roleName: 'super_admin' }
      };

      await revokeRoleFromUser(req, mockRes);

      expect(UserAccount.countSuperAdmins).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Cannot revoke the last remaining super_admin role in the system'
      });
    });

    it('should successfully revoke super_admin role if count > 1', async () => {
      jest.spyOn(UserAccount, 'findById').mockResolvedValue({
        id: 'user-1',
        roles: ['super_admin']
      });
      jest.spyOn(UserAccount, 'countSuperAdmins').mockResolvedValue(2);
      jest.spyOn(UserAccount, 'removeRole').mockResolvedValue({
        id: 'user-1',
        roles: []
      });

      const req = {
        user: { role: 'super_admin' },
        body: { targetUserId: 'user-1', roleName: 'super_admin' }
      };

      await revokeRoleFromUser(req, mockRes);

      expect(UserAccount.removeRole).toHaveBeenCalledWith('user-1', 'super_admin');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Role "super_admin" successfully revoked from user',
        data: {
          userId: 'user-1',
          roles: []
        }
      });
    });

    it('should successfully revoke a standard role from user', async () => {
      jest.spyOn(UserAccount, 'findById').mockResolvedValue({
        id: 'user-1',
        roles: ['editor', 'viewer']
      });
      jest.spyOn(UserAccount, 'removeRole').mockResolvedValue({
        id: 'user-1',
        roles: ['viewer']
      });

      const req = {
        user: { role: 'admin' },
        body: { targetUserId: 'user-1', roleName: ' EDITOR ' }
      };

      await revokeRoleFromUser(req, mockRes);

      expect(UserAccount.removeRole).toHaveBeenCalledWith('user-1', 'editor');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Role "editor" successfully revoked from user',
        data: {
          userId: 'user-1',
          roles: ['viewer']
        }
      });
    });

    it('should return 500 when an error occurs during revocation', async () => {
      jest.spyOn(UserAccount, 'findById').mockRejectedValue(new Error('Connection failure'));

      const req = {
        user: { role: 'admin' },
        body: { targetUserId: 'user-1', roleName: 'editor' }
      };

      await revokeRoleFromUser(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to revoke role',
        details: 'Connection failure'
      });
    });
  });
});