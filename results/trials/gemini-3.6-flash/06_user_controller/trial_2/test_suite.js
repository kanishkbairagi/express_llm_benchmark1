import { jest } from '@jest/globals';
import {
  updateProfile,
  requestPasswordReset,
  resetPassword,
  User,
  EmailService,
  CryptoHelper
} from '../dataset/06_user_controller.js';

describe('06_user_controller.js Unit Tests', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      body: {},
      params: {},
      user: null
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('updateProfile', () => {
    it('should return 401 if user authentication is missing', async () => {
      req.user = null;
      req.params = {};

      await updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 404 if user is not found in database', async () => {
      req.user = { id: 'usr_123' };
      jest.spyOn(User, 'findById').mockResolvedValue(null);

      await updateProfile(req, res);

      expect(User.findById).toHaveBeenCalledWith('usr_123');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'User not found'
      });
    });

    it('should return 400 if name is not a string or is empty after trim', async () => {
      req.user = { id: 'usr_123' };
      jest.spyOn(User, 'findById').mockResolvedValue({ id: 'usr_123' });

      req.body = { name: '   ' };
      await updateProfile(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Name cannot be empty'
      });

      req.body = { name: 12345 };
      await updateProfile(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Name cannot be empty'
      });
    });

    it('should return 400 if bio is not a string or exceeds 250 characters', async () => {
      req.user = { id: 'usr_123' };
      jest.spyOn(User, 'findById').mockResolvedValue({ id: 'usr_123' });

      req.body = { bio: 12345 };
      await updateProfile(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Bio must be a string up to 250 characters'
      });

      req.body = { bio: 'a'.repeat(251) };
      await updateProfile(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Bio must be a string up to 250 characters'
      });
    });

    it('should return 400 if phone format is invalid', async () => {
      req.user = { id: 'usr_123' };
      jest.spyOn(User, 'findById').mockResolvedValue({ id: 'usr_123' });

      req.body = { phone: 'invalid-phone-123' };
      await updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid international phone number format'
      });
    });

    it('should return 400 if avatarUrl is invalid URL', async () => {
      req.user = { id: 'usr_123' };
      jest.spyOn(User, 'findById').mockResolvedValue({ id: 'usr_123' });

      req.body = { avatarUrl: 'not-a-valid-url' };
      await updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid avatar URL'
      });
    });

    it('should successfully update user profile with valid input using req.params.userId', async () => {
      req.params = { userId: 'usr_456' };
      req.body = {
        name: ' John Doe ',
        bio: ' Soft-spoken dev ',
        phone: '+12345678901',
        avatarUrl: 'https://example.com/avatar.jpg'
      };

      jest.spyOn(User, 'findById').mockResolvedValue({ id: 'usr_456' });
      jest.spyOn(User, 'update').mockResolvedValue({
        id: 'usr_456',
        name: 'John Doe',
        bio: 'Soft-spoken dev',
        phone: '+12345678901',
        avatarUrl: 'https://example.com/avatar.jpg'
      });

      await updateProfile(req, res);

      expect(User.update).toHaveBeenCalledWith('usr_456', {
        name: 'John Doe',
        bio: 'Soft-spoken dev',
        phone: '+12345678901',
        avatarUrl: 'https://example.com/avatar.jpg'
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Profile updated successfully',
        data: expect.objectContaining({
          id: 'usr_456',
          name: 'John Doe'
        })
      });
    });

    it('should handle internal errors and return status 500', async () => {
      req.user = { id: 'usr_123' };
      jest.spyOn(User, 'findById').mockRejectedValue(new Error('Database error'));

      await updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to update profile',
        details: 'Database error'
      });
    });
  });

  describe('requestPasswordReset', () => {
    it('should return 400 if email is missing', async () => {
      req.body = {};

      await requestPasswordReset(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Email is required'
      });
    });

    it('should return 400 if email format is invalid', async () => {
      req.body = { email: 'invalid-email-format' };

      await requestPasswordReset(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid email format'
      });
    });

    it('should return timing-safe success response when user does not exist', async () => {
      req.body = { email: 'nonexistent@example.com' };
      jest.spyOn(User, 'findByEmail').mockResolvedValue(null);

      await requestPasswordReset(req, res);

      expect(User.findByEmail).toHaveBeenCalledWith('nonexistent@example.com');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'If an account exists with that email, a password reset link has been dispatched'
      });
    });

    it('should generate token, save token and send email when user exists', async () => {
      req.body = { email: 'User@Example.com' };
      const existingUser = { id: 'usr_123', email: 'user@example.com' };

      jest.spyOn(User, 'findByEmail').mockResolvedValue(existingUser);
      jest.spyOn(CryptoHelper, 'generateToken').mockReturnValue('token_123456');
      jest.spyOn(User, 'saveResetToken').mockResolvedValue(true);
      jest.spyOn(EmailService, 'sendResetEmail').mockResolvedValue(true);

      await requestPasswordReset(req, res);

      expect(User.findByEmail).toHaveBeenCalledWith('user@example.com');
      expect(CryptoHelper.generateToken).toHaveBeenCalled();
      expect(User.saveResetToken).toHaveBeenCalledWith(
        'usr_123',
        'token_123456',
        expect.any(Date)
      );
      expect(EmailService.sendResetEmail).toHaveBeenCalledWith('user@example.com', 'token_123456');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'If an account exists with that email, a password reset link has been dispatched'
      });
    });

    it('should handle internal errors and return 500 status', async () => {
      req.body = { email: 'user@example.com' };
      jest.spyOn(User, 'findByEmail').mockRejectedValue(new Error('Connection failure'));

      await requestPasswordReset(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to process password reset request',
        details: 'Connection failure'
      });
    });
  });

  describe('resetPassword', () => {
    it('should return 400 if token or newPassword is missing', async () => {
      req.body = { token: 'valid_token' };
      await resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Token and newPassword are required'
      });

      req.body = { newPassword: 'password123' };
      await resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Token and newPassword are required'
      });
    });

    it('should return 400 if newPassword is not a string or shorter than 8 characters', async () => {
      req.body = { token: 'valid_token', newPassword: 'short' };
      await resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'New password must be at least 8 characters long'
      });

      req.body = { token: 'valid_token', newPassword: 12345678 };
      await resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'New password must be at least 8 characters long'
      });
    });

    it('should return 400 if reset token is invalid or user not found', async () => {
      req.body = { token: 'invalid_token', newPassword: 'newPassword123' };
      jest.spyOn(User, 'findByResetToken').mockResolvedValue(null);

      await resetPassword(req, res);

      expect(User.findByResetToken).toHaveBeenCalledWith('invalid_token');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid or expired password reset token'
      });
    });

    it('should return 400 if reset token has expired', async () => {
      req.body = { token: 'expired_token', newPassword: 'newPassword123' };
      const expiredUser = {
        id: 'usr_123',
        resetTokenExpires: new Date(Date.now() - 3600000) // 1 hour in the past
      };
      jest.spyOn(User, 'findByResetToken').mockResolvedValue(expiredUser);

      await resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Password reset token has expired'
      });
    });

    it('should successfully reset password when valid token and non-expired token are provided', async () => {
      req.body = { token: 'valid_token', newPassword: 'securePassword123' };
      const validUser = {
        id: 'usr_123',
        resetTokenExpires: new Date(Date.now() + 3600000) // 1 hour in the future
      };

      jest.spyOn(User, 'findByResetToken').mockResolvedValue(validUser);
      jest.spyOn(CryptoHelper, 'hashPassword').mockResolvedValue('mock_hashed_securePassword123');
      jest.spyOn(User, 'update').mockResolvedValue({ id: 'usr_123' });

      await resetPassword(req, res);

      expect(CryptoHelper.hashPassword).toHaveBeenCalledWith('securePassword123');
      expect(User.update).toHaveBeenCalledWith('usr_123', {
        password: 'mock_hashed_securePassword123',
        resetToken: null,
        resetTokenExpires: null
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Password has been successfully reset'
      });
    });

    it('should handle internal errors and return 500 status', async () => {
      req.body = { token: 'valid_token', newPassword: 'securePassword123' };
      jest.spyOn(User, 'findByResetToken').mockRejectedValue(new Error('Reset failed'));

      await resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to reset password',
        details: 'Reset failed'
      });
    });
  });
});