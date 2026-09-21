import { jest } from '@jest/globals';
import {
  updateProfile,
  requestPasswordReset,
  resetPassword,
  User,
  EmailService,
  CryptoHelper
} from '../dataset/06_user_controller.js';

describe('06_user_controller Unit Tests', () => {
  let mockRes;

  beforeEach(() => {
    jest.restoreAllMocks();
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('updateProfile', () => {
    test('should return 401 if user ID is missing from req.user and req.params', async () => {
      const req = { body: { name: 'John Doe' } };

      await updateProfile(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 404 if user is not found', async () => {
      const req = { user: { id: 'usr_123' }, body: {} };
      jest.spyOn(User, 'findById').mockResolvedValue(null);

      await updateProfile(req, mockRes);

      expect(User.findById).toHaveBeenCalledWith('usr_123');
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'User not found'
      });
    });

    test('should return 400 for invalid name (empty string or non-string)', async () => {
      const req = {
        params: { userId: 'usr_123' },
        body: { name: '   ' }
      };
      jest.spyOn(User, 'findById').mockResolvedValue({ id: 'usr_123' });

      await updateProfile(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Name cannot be empty'
      });
    });

    test('should return 400 if bio is not a string or exceeds 250 characters', async () => {
      const req = {
        user: { id: 'usr_123' },
        body: { bio: 'a'.repeat(251) }
      };
      jest.spyOn(User, 'findById').mockResolvedValue({ id: 'usr_123' });

      await updateProfile(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Bio must be a string up to 250 characters'
      });
    });

    test('should return 400 for invalid phone number format', async () => {
      const req = {
        user: { id: 'usr_123' },
        body: { phone: 'invalid-phone-123' }
      };
      jest.spyOn(User, 'findById').mockResolvedValue({ id: 'usr_123' });

      await updateProfile(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid international phone number format'
      });
    });

    test('should return 400 for invalid avatar URL', async () => {
      const req = {
        user: { id: 'usr_123' },
        body: { avatarUrl: 'invalid-url' }
      };
      jest.spyOn(User, 'findById').mockResolvedValue({ id: 'usr_123' });

      await updateProfile(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid avatar URL'
      });
    });

    test('should successfully update profile with valid fields', async () => {
      const req = {
        params: { userId: 'usr_123' },
        body: {
          name: ' Jane Doe ',
          bio: 'Software Developer',
          phone: '+12345678901',
          avatarUrl: 'https://example.com/avatar.jpg'
        }
      };

      const existingUser = { id: 'usr_123', name: 'Old Name' };
      const updatedUserResult = {
        id: 'usr_123',
        name: 'Jane Doe',
        bio: 'Software Developer',
        phone: '+12345678901',
        avatarUrl: 'https://example.com/avatar.jpg'
      };

      jest.spyOn(User, 'findById').mockResolvedValue(existingUser);
      jest.spyOn(User, 'update').mockResolvedValue(updatedUserResult);

      await updateProfile(req, mockRes);

      expect(User.update).toHaveBeenCalledWith('usr_123', {
        name: 'Jane Doe',
        bio: 'Software Developer',
        phone: '+12345678901',
        avatarUrl: 'https://example.com/avatar.jpg'
      });
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Profile updated successfully',
        data: updatedUserResult
      });
    });

    test('should return 500 on unexpected database exception', async () => {
      const req = { user: { id: 'usr_123' } };
      jest.spyOn(User, 'findById').mockRejectedValue(new Error('DB Connection Failed'));

      await updateProfile(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to update profile',
        details: 'DB Connection Failed'
      });
    });
  });

  describe('requestPasswordReset', () => {
    test('should return 400 if email is missing', async () => {
      const req = { body: {} };

      await requestPasswordReset(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Email is required'
      });
    });

    test('should return 400 for invalid email format', async () => {
      const req = { body: { email: 'not-an-email' } };

      await requestPasswordReset(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid email format'
      });
    });

    test('should return 200 timing-safe response if user is not found', async () => {
      const req = { body: { email: 'nonexistent@example.com' } };
      jest.spyOn(User, 'findByEmail').mockResolvedValue(null);

      await requestPasswordReset(req, mockRes);

      expect(User.findByEmail).toHaveBeenCalledWith('nonexistent@example.com');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'If an account exists with that email, a password reset link has been dispatched'
      });
    });

    test('should save reset token, send reset email, and return 200 when user exists', async () => {
      const req = { body: { email: 'User@Example.com' } };
      const mockUser = { id: 'usr_123', email: 'user@example.com' };

      jest.spyOn(User, 'findByEmail').mockResolvedValue(mockUser);
      jest.spyOn(CryptoHelper, 'generateToken').mockReturnValue('generated_token_123');
      jest.spyOn(User, 'saveResetToken').mockResolvedValue(true);
      jest.spyOn(EmailService, 'sendResetEmail').mockResolvedValue(true);

      await requestPasswordReset(req, mockRes);

      expect(User.findByEmail).toHaveBeenCalledWith('user@example.com');
      expect(CryptoHelper.generateToken).toHaveBeenCalled();
      expect(User.saveResetToken).toHaveBeenCalledWith(
        'usr_123',
        'generated_token_123',
        expect.any(Date)
      );
      expect(EmailService.sendResetEmail).toHaveBeenCalledWith('user@example.com', 'generated_token_123');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'If an account exists with that email, a password reset link has been dispatched'
      });
    });

    test('should return 500 when error occurs during password reset request', async () => {
      const req = { body: { email: 'user@example.com' } };
      jest.spyOn(User, 'findByEmail').mockRejectedValue(new Error('Database error'));

      await requestPasswordReset(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to process password reset request',
        details: 'Database error'
      });
    });
  });

  describe('resetPassword', () => {
    test('should return 400 if token or newPassword is missing', async () => {
      const req = { body: { token: 'valid_token' } };

      await resetPassword(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Token and newPassword are required'
      });
    });

    test('should return 400 if newPassword is not a string or less than 8 characters', async () => {
      const req = { body: { token: 'valid_token', newPassword: 'short' } };

      await resetPassword(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'New password must be at least 8 characters long'
      });
    });

    test('should return 400 if user with token is not found', async () => {
      const req = { body: { token: 'invalid_token', newPassword: 'newPassword123' } };
      jest.spyOn(User, 'findByResetToken').mockResolvedValue(null);

      await resetPassword(req, mockRes);

      expect(User.findByResetToken).toHaveBeenCalledWith('invalid_token');
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid or expired password reset token'
      });
    });

    test('should return 400 if reset token is expired', async () => {
      const req = { body: { token: 'expired_token', newPassword: 'newPassword123' } };
      const expiredUser = {
        id: 'usr_123',
        resetTokenExpires: new Date(Date.now() - 3600000)
      };
      jest.spyOn(User, 'findByResetToken').mockResolvedValue(expiredUser);

      await resetPassword(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Password reset token has expired'
      });
    });

    test('should successfully reset password when token and password are valid', async () => {
      const req = { body: { token: 'valid_token', newPassword: 'newPassword123' } };
      const validUser = {
        id: 'usr_123',
        resetTokenExpires: new Date(Date.now() + 3600000)
      };

      jest.spyOn(User, 'findByResetToken').mockResolvedValue(validUser);
      jest.spyOn(CryptoHelper, 'hashPassword').mockResolvedValue('mock_hashed_newPassword123');
      jest.spyOn(User, 'update').mockResolvedValue({ id: 'usr_123' });

      await resetPassword(req, mockRes);

      expect(CryptoHelper.hashPassword).toHaveBeenCalledWith('newPassword123');
      expect(User.update).toHaveBeenCalledWith('usr_123', {
        password: 'mock_hashed_newPassword123',
        resetToken: null,
        resetTokenExpires: null
      });
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Password has been successfully reset'
      });
    });

    test('should return 500 if error occurs during resetPassword', async () => {
      const req = { body: { token: 'valid_token', newPassword: 'newPassword123' } };
      jest.spyOn(User, 'findByResetToken').mockRejectedValue(new Error('Database Error'));

      await resetPassword(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to reset password',
        details: 'Database Error'
      });
    });
  });
});