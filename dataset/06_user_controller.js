// 06_user_controller.js - Profile Updates & Password Reset Tokens

// Mock Database & Services
export const User = {
  findById: async (id) => null,
  findByEmail: async (email) => null,
  findByResetToken: async (token) => null,
  update: async (id, data) => ({ id, ...data }),
  saveResetToken: async (id, token, expiresAt) => true
};

export const EmailService = {
  sendResetEmail: async (email, resetToken) => true
};

export const CryptoHelper = {
  generateToken: () => 'mock_random_crypto_reset_token_hex_123',
  hashPassword: async (password) => `mock_hashed_${password}`
};

export const updateProfile = async (req, res) => {
  try {
    const userId = req.user?.id || req.params?.userId;
    const { name, bio, phone, avatarUrl } = req.body || {};

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const updates = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Name cannot be empty' });
      }
      updates.name = name.trim();
    }

    if (bio !== undefined) {
      if (typeof bio !== 'string' || bio.length > 250) {
        return res.status(400).json({ success: false, error: 'Bio must be a string up to 250 characters' });
      }
      updates.bio = bio.trim();
    }

    if (phone !== undefined) {
      const phoneRegex = /^\+?[1-9]\d{7,14}$/;
      if (phone && !phoneRegex.test(phone)) {
        return res.status(400).json({ success: false, error: 'Invalid international phone number format' });
      }
      updates.phone = phone;
    }

    if (avatarUrl !== undefined) {
      try {
        new URL(avatarUrl);
        updates.avatarUrl = avatarUrl;
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid avatar URL' });
      }
    }

    const updatedUser = await User.update(userId, updates);

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to update profile',
      details: error.message
    });
  }
};

export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    const user = await User.findByEmail(email.toLowerCase());
    // Timing-safe response to prevent user enumeration attacks
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If an account exists with that email, a password reset link has been dispatched'
      });
    }

    const resetToken = CryptoHelper.generateToken();
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    await User.saveResetToken(user.id, resetToken, expiresAt);
    await EmailService.sendResetEmail(user.email, resetToken);

    return res.status(200).json({
      success: true,
      message: 'If an account exists with that email, a password reset link has been dispatched'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to process password reset request',
      details: error.message
    });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Token and newPassword are required'
      });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 8 characters long'
      });
    }

    const user = await User.findByResetToken(token);
    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired password reset token'
      });
    }

    if (user.resetTokenExpires && new Date(user.resetTokenExpires) < new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Password reset token has expired'
      });
    }

    const hashedPassword = await CryptoHelper.hashPassword(newPassword);
    await User.update(user.id, {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpires: null
    });

    return res.status(200).json({
      success: true,
      message: 'Password has been successfully reset'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to reset password',
      details: error.message
    });
  }
};
