// 21_rbac_controller.js - Role-Based Access Control Role Granting

// Mock Database Models
export const UserAccount = {
  findById: async (id) => null,
  addRole: async (userId, roleName, scope) => ({ id: userId, roles: [roleName] }),
  removeRole: async (userId, roleName) => ({ id: userId, roles: [] }),
  countSuperAdmins: async () => 2
};

export const RoleDefinition = {
  findByName: async (name) => null,
  listAll: async () => []
};

export const assignRoleToUser = async (req, res) => {
  try {
    const requester = req.user;
    if (!requester || (requester.role !== 'admin' && requester.role !== 'super_admin')) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Requires administrator privileges to assign roles'
      });
    }

    const { targetUserId, roleName, scope = 'global' } = req.body || {};

    if (!targetUserId || !roleName) {
      return res.status(400).json({
        success: false,
        error: 'targetUserId and roleName are required'
      });
    }

    const cleanRole = roleName.toLowerCase().trim();

    if (cleanRole === 'super_admin' && requester.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Only super_admin can assign the super_admin role'
      });
    }

    const roleExists = await RoleDefinition.findByName(cleanRole);
    if (!roleExists) {
      return res.status(404).json({
        success: false,
        error: `Role "${cleanRole}" does not exist in the system catalog`
      });
    }

    const targetUser = await UserAccount.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: `User with ID ${targetUserId} not found`
      });
    }

    const existingRoles = targetUser.roles || [];
    if (existingRoles.includes(cleanRole)) {
      return res.status(409).json({
        success: false,
        error: `User already has the "${cleanRole}" role`
      });
    }

    const updatedUser = await UserAccount.addRole(targetUserId, cleanRole, scope);

    return res.status(200).json({
      success: true,
      message: `Role "${cleanRole}" successfully granted to user`,
      data: {
        userId: targetUserId,
        roles: updatedUser.roles,
        scope
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to assign role',
      details: error.message
    });
  }
};

export const revokeRoleFromUser = async (req, res) => {
  try {
    const requester = req.user;
    if (!requester || (requester.role !== 'admin' && requester.role !== 'super_admin')) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Requires administrator privileges to revoke roles'
      });
    }

    const { targetUserId, roleName } = req.body || {};

    if (!targetUserId || !roleName) {
      return res.status(400).json({
        success: false,
        error: 'targetUserId and roleName are required'
      });
    }

    const cleanRole = roleName.toLowerCase().trim();

    const targetUser = await UserAccount.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: `User with ID ${targetUserId} not found`
      });
    }

    const existingRoles = targetUser.roles || [];
    if (!existingRoles.includes(cleanRole)) {
      return res.status(400).json({
        success: false,
        error: `User does not possess the "${cleanRole}" role`
      });
    }

    // Safety guard: ensure the system never loses all super_admins
    if (cleanRole === 'super_admin') {
      const superAdminCount = await UserAccount.countSuperAdmins();
      if (superAdminCount <= 1) {
        return res.status(400).json({
          success: false,
          error: 'Cannot revoke the last remaining super_admin role in the system'
        });
      }
    }

    const updatedUser = await UserAccount.removeRole(targetUserId, cleanRole);

    return res.status(200).json({
      success: true,
      message: `Role "${cleanRole}" successfully revoked from user`,
      data: {
        userId: targetUserId,
        roles: updatedUser.roles
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to revoke role',
      details: error.message
    });
  }
};
