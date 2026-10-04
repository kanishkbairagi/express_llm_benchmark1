import { jest } from '@jest/globals';
import {
  User,
  EmailService,
  CryptoHelper,
  updateProfile,
  requestPasswordReset,
  resetPassword
} from '../dataset/06_user_controller.js';

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('06_user_controller.js Unit Tests', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('updateProfile', () => {
    it('should return 401 if no userId is provided in req.user or req.params', async () => {
      const req = { body: { name: 'John' } };
      const res = mockResponse();

      await updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 404 if user is not found in database', async () => {
      jest.spyOn(User, 'findById').mockResolvedValue(null);

      const req = { user: { id: 'user_123' }, body: {} };
      const res = mockResponse();

      await updateProfile(req, res);

      expect(User.findById).toHaveBeenCalledWith('user_123');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'User not found'
      });
    });

    it('should return 400 if name is provided but invalid', async () => {
      jest.spyOn(User, 'findById').mockResolvedValue({ id: 'user_123' });

      const req1 = { user: { id: 'user_123' }, body: { name: '   ' } };
      const res1 = mockResponse();
      await updateProfile(req1, res1);
      expect(res1.status).toHaveBeenCalledWith(400);
      expect(res1.json).toHaveBeenCalledWith({ success: false, error: 'Name cannot be empty' });

      const req2 = { user: { id: 'user_123' }, body: { name: 12345 } };
      const res2 = mockResponse();
      await updateProfile(req2, res2);
      expect(res2.status).toHaveBeenCalledWith(400);
      expect(res2.json).toHaveBeenCalledWith({ success: false, error: 'Name cannot be empty' });
    });

    it('should return 400 if bio is provided but invalid', async () => {
      jest.spyOn(User, 'findById').mockResolvedValue({ id: 'user_123' });

      const req1 = { user: { id: 'user_123' }, body: { bio: 123 } };
      const res1 = mockResponse();
      await updateProfile(req1, res1);
      expect(res1.status).toHaveBeenCalledWith(400);

      const req2 = { user: { id: 'user_123' }, body: { bio: 'a'.repeat(251) } };
      const res2 = mockResponse();
      await updateProfile(req2, res2);
      expect(res2.status).toHaveBeenCalledWith(400);
      expect(res2.json).toHaveBeenCalledWith({ success: false, error: 'Bio must be a string up to 250 characters' });
    });

    it('should return 400 if phone format is invalid', async () => {
      jest.spyOn(User, 'findById').mockResolvedValue({ id: 'user_123' });

      const req = { user: { id: 'user_123' }, body: { phone: '123' } };
      const res = mockResponse();

      await updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid international phone number format'
      });
    });

    it('should return 400 if avatarUrl is invalid', async () => {
      jest.spyOn(User, 'findById').mockResolvedValue({ id: 'user_123' });

      const req = { user: { id: 'user_123' }, body: { avatarUrl: 'invalid-url' } };
      const res = mockResponse();

      await updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid avatar URL'
      });
    });

    it('should update profile successfully with valid data', async () => {
      const existingUser = { id: 'user_123', name: 'Old Name' };
      jest.spyOn(User, 'findById').mockResolvedValue(existingUser);
      jest.spyOn(User, 'update').mockImplementation(async (id, updates) => ({ id, ...updates }));

      const req = {
        params: { userId: 'user_123' },
        body: {
          name: '  Jane Doe  ',
          bio: ' Developer ',
          phone: '+12345678901',
          avatarUrl: 'https://example.com/avatar.png'
        }
      };
      const res = mockResponse();

      await updateProfile(req, res);

      expect(User.update).toHaveBeenCalledWith('user_123', {
        name: 'Jane Doe',
        bio: 'Developer',
        phone: '+12345678901',
        avatarUrl: 'https://example.com/avatar.png'
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Profile updated successfully',
        data: {
          id: 'user_123',
          name: 'Jane Doe',
          bio: 'Developer',
          phone: '+12345678901',
          avatarUrl: 'https://example.com/avatar.png'
        }
      });
    });

    it('should return 500 when an exception is thrown', async () => {
      jest.spyOn(User, 'findById').mockRejectedValue(new Error('Database connection failed'));

      const req = { user: { id: 'user_123' } };
      const res = mockResponse();

      await updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to update profile',
        details: 'Database connection failed'
      });
    });
  });

  describe('requestPasswordReset', () => {
    it('should return 400 if email is missing', async () => {
      const req = { body: {} };
      const res = mockResponse();

      await requestPasswordReset(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Email is required'
      });
    });

    it('should return 400 if email format is invalid', async () => {
      const req = { body: { email: 'invalid-email-format' } };
      const res = mockResponse();

      await requestPasswordReset(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid email format'
      });
    });

    it('should return 200 with timing-safe message if user is not found', async () => {
      jest.spyOn(User, 'findByEmail').mockResolvedValue(null);

      const req = { body: { email: 'nonexistent@example.com' } };
      const res = mockResponse();

      await requestPasswordReset(req, res);

      expect(User.findByEmail).toHaveBeenCalledWith('nonexistent@example.com');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'If an account exists with that email, a password reset link has been dispatched'
      });
    });

    it('should generate token, save it, send email, and return 200 when user exists', async () => {
      const mockUser = { id: 'user_123', email: 'user@example.com' };
      jest.spyOn(User, 'findByEmail').mockResolvedValue(mockUser);
      jest.spyOn(CryptoHelper, 'generateToken').mockReturnValue('custom_reset_token');
      jest.spyOn(User, 'saveResetToken').mockResolvedValue(true);
      jest.spyOn(EmailService, 'sendResetEmail').mockResolvedValue(true);

      const req = { body: { email: 'USER@EXAMPLE.COM' } };
      const res = mockResponse();

      await requestPasswordReset(req, res);

      expect(User.findByEmail).toHaveBeenCalledWith('user@example.com');
      expect(CryptoHelper.generateToken).toHaveBeenCalled();
      expect(User.saveResetToken).toHaveBeenCalledWith('user_123', 'custom_reset_token', expect.any(Date));
      expect(EmailService.sendResetEmail).toHaveBeenCalledWith('user@example.com', 'custom_reset_token');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'If an account exists with that email, a password reset link has been dispatched'
      });
    });

    it('should return 500 if an error occurs', async () => {
      jest.spyOn(User, 'findByEmail').mockRejectedValue(new Error('DB Error'));

      const req = { body: { email: 'test@example.com' } };
      const res = mockResponse();

      await requestPasswordReset(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to process password reset request',
        details: 'DB Error'
      });
    });
  });

  describe('resetPassword', () => {
    it('should return 400 if token or newPassword is missing', async () => {
      const req = { body: { token: 'token123' } };
      const res = mockResponse();

      await resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Token and newPassword are required'
      });
    });

    it('should return 400 if newPassword is not a string or less than 8 characters', async () => {
      const req1 = { body: { token: 'token123', newPassword: 'short' } };
      const res1 = mockResponse();
      await resetPassword(req1, res1);
      expect(res1.status).toHaveBeenCalledWith(400);

      const req2 = { body: { token: 'token123', newPassword: 12345678 } };
      const res2 = mockResponse();
      await resetPassword(req2, res2);
      expect(res2.status).toHaveBeenCalledWith(400);
      expect(res2.json).toHaveBeenCalledWith({
        success: false,
        error: 'New password must be at least 8 characters long'
      });
    });

    it('should return 400 if user is not found by reset token', async () => {
      jest.spyOn(User, 'findByResetToken').mockResolvedValue(null);

      const req = { body: { token: 'invalid_token', newPassword: 'newPassword123' } };
      const res = mockResponse();

      await resetPassword(req, res);

      expect(User.findByResetToken).toHaveBeenCalledWith('invalid_token');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid or expired password reset token'
      });
    });

    it('should return 400 if reset token has expired', async () => {
      const expiredDate = new Date(Date.now() - 10000);
      jest.spyOn(User, 'findByResetToken').mockResolvedValue({
        id: 'user_123',
        resetTokenExpires: expiredDate
      });

      const req = { body: { token: 'expired_token', newPassword: 'newPassword123' } };
      const res = mockResponse();

      await resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Password reset token has expired'
      });
    });

    it('should successfully reset password and clear reset token', async () => {
      const futureDate = new Date(Date.now() + 100000);
      jest.spyOn(User, 'findByResetToken').mockResolvedValue({
        id: 'user_123',
        resetTokenExpires: futureDate
      });
      jest.spyOn(CryptoHelper, 'hashPassword').mockResolvedValue('hashed_secret_pass');
      jest.spyOn(User, 'update').mockResolvedValue({});

      const req = { body: { token: 'valid_token', newPassword: 'newPassword123' } };
      const res = mockResponse();

      await resetPassword(req, res);

      expect(CryptoHelper.hashPassword).toHaveBeenCalledWith('newPassword123');
      expect(User.update).toHaveBeenCalledWith('user_123', {
        password: 'hashed_secret_pass',
        resetToken: null,
        resetTokenExpires: null
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Password has been successfully reset'
      });
    });

    it('should return 500 if an error occurs during password reset', async () => {
      jest.spyOn(User, 'findByResetToken').mockRejectedValue(new Error('Reset error'));

      const req = { body: { token: 'token123', newPassword: 'newPassword123' } };
      const res = mockResponse();

      await resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to reset password',
        details: 'Reset error'
      });
    });
  });
});