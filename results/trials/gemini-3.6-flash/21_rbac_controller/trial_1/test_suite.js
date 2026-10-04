import { jest } from '@jest/globals';
import {
  UserAccount,
  RoleDefinition,
  assignRoleToUser,
  revokeRoleFromUser
} from '../dataset/21_rbac_controller.js';

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('21_rbac_controller - Role-Based Access Control', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('assignRoleToUser', () => {
    it('should return 403 if requester is missing or not an admin/super_admin', async () => {
      const req = { user: { id: 1, role: 'editor' } };
      const res = createMockResponse();

      await assignRoleToUser(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Forbidden: Requires administrator privileges to assign roles'
        })
      );
    });

    it('should return 400 if targetUserId or roleName is missing', async () => {
      const req = {
        user: { id: 1, role: 'admin' },
        body: { targetUserId: 10 }
      };
      const res = createMockResponse();

      await assignRoleToUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'targetUserId and roleName are required'
      });
    });

    it('should return 403 if admin attempts to assign super_admin role', async () => {
      const req = {
        user: { id: 1, role: 'admin' },
        body: { targetUserId: 10, roleName: 'SUPER_ADMIN' }
      };
      const res = createMockResponse();

      await assignRoleToUser(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Only super_admin can assign the super_admin role'
      });
    });

    it('should return 404 if role does not exist in RoleDefinition catalog', async () => {
      jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue(null);

      const req = {
        user: { id: 1, role: 'admin' },
        body: { targetUserId: 10, roleName: 'non_existent_role' }
      };
      const res = createMockResponse();

      await assignRoleToUser(req, res);

      expect(RoleDefinition.findByName).toHaveBeenCalledWith('non_existent_role');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Role "non_existent_role" does not exist in the system catalog'
      });
    });

    it('should return 404 if target user is not found', async () => {
      jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({ name: 'editor' });
      jest.spyOn(UserAccount, 'findById').mockResolvedValue(null);

      const req = {
        user: { id: 1, role: 'admin' },
        body: { targetUserId: 999, roleName: 'editor' }
      };
      const res = createMockResponse();

      await assignRoleToUser(req, res);

      expect(UserAccount.findById).toHaveBeenCalledWith(999);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'User with ID 999 not found'
      });
    });

    it('should return 409 if user already possesses the role', async () => {
      jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({ name: 'editor' });
      jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 10, roles: ['editor'] });

      const req = {
        user: { id: 1, role: 'admin' },
        body: { targetUserId: 10, roleName: 'editor' }
      };
      const res = createMockResponse();

      await assignRoleToUser(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'User already has the "editor" role'
      });
    });

    it('should successfully assign role and default scope to user', async () => {
      jest.spyOn(RoleDefinition, 'findByName').mockResolvedValue({ name: 'editor' });
      jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 10, roles: ['viewer'] });
      jest.spyOn(UserAccount, 'addRole').mockResolvedValue({ id: 10, roles: ['viewer', 'editor'] });

      const req = {
        user: { id: 1, role: 'super_admin' },
        body: { targetUserId: 10, roleName: 'EDITOR ' }
      };
      const res = createMockResponse();

      await assignRoleToUser(req, res);

      expect(UserAccount.addRole).toHaveBeenCalledWith(10, 'editor', 'global');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Role "editor" successfully granted to user',
        data: {
          userId: 10,
          roles: ['viewer', 'editor'],
          scope: 'global'
        }
      });
    });

    it('should return 500 when an error occurs during assignment', async () => {
      jest.spyOn(RoleDefinition, 'findByName').mockRejectedValue(new Error('Database error'));

      const req = {
        user: { id: 1, role: 'admin' },
        body: { targetUserId: 10, roleName: 'editor' }
      };
      const res = createMockResponse();

      await assignRoleToUser(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to assign role',
        details: 'Database error'
      });
    });
  });

  describe('revokeRoleFromUser', () => {
    it('should return 403 if requester lacks admin privileges', async () => {
      const req = { user: { id: 2, role: 'user' } };
      const res = createMockResponse();

      await revokeRoleFromUser(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Forbidden: Requires administrator privileges to revoke roles'
      });
    });

    it('should return 400 if required fields are missing', async () => {
      const req = {
        user: { id: 1, role: 'admin' },
        body: { roleName: 'editor' }
      };
      const res = createMockResponse();

      await revokeRoleFromUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'targetUserId and roleName are required'
      });
    });

    it('should return 404 if target user is not found', async () => {
      jest.spyOn(UserAccount, 'findById').mockResolvedValue(null);

      const req = {
        user: { id: 1, role: 'admin' },
        body: { targetUserId: 50, roleName: 'editor' }
      };
      const res = createMockResponse();

      await revokeRoleFromUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'User with ID 50 not found'
      });
    });

    it('should return 400 if user does not possess the specified role', async () => {
      jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 50, roles: ['viewer'] });

      const req = {
        user: { id: 1, role: 'admin' },
        body: { targetUserId: 50, roleName: 'editor' }
      };
      const res = createMockResponse();

      await revokeRoleFromUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'User does not possess the "editor" role'
      });
    });

    it('should return 400 if trying to revoke the last remaining super_admin', async () => {
      jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 50, roles: ['super_admin'] });
      jest.spyOn(UserAccount, 'countSuperAdmins').mockResolvedValue(1);

      const req = {
        user: { id: 1, role: 'super_admin' },
        body: { targetUserId: 50, roleName: 'super_admin' }
      };
      const res = createMockResponse();

      await revokeRoleFromUser(req, res);

      expect(UserAccount.countSuperAdmins).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Cannot revoke the last remaining super_admin role in the system'
      });
    });

    it('should successfully revoke super_admin if count is greater than 1', async () => {
      jest.spyOn(UserAccount, 'findById').mockResolvedValue({ id: 50, roles: ['super_admin', 'editor'] });
      jest.spyOn(UserAccount, 'countSuperAdmins').mockResolvedValue(2);
      jest.spyOn(UserAccount, 'removeRole').mockResolvedValue({ id: 50, roles: ['editor'] });

      const req = {
        user: { id: 1, role: 'super_admin' },
        body: { targetUserId: 50, roleName: 'super_admin' }
      };
      const res = createMockResponse();

      await revokeRoleFromUser(req, res);

      expect(UserAccount.removeRole).toHaveBeenCalledWith(50, 'super_admin');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Role "super_admin" successfully revoked from user',
        data: {
          userId: 50,
          roles: ['editor']
        }
      });
    });

    it('should return 500 when an exception is thrown', async () => {
      jest.spyOn(UserAccount, 'findById').mockRejectedValue(new Error('Connection failure'));

      const req = {
        user: { id: 1, role: 'admin' },
        body: { targetUserId: 50, roleName: 'editor' }
      };
      const res = createMockResponse();

      await revokeRoleFromUser(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to revoke role',
        details: 'Connection failure'
      });
    });
  });
});