import { jest } from '@jest/globals';
import {
  User,
  EmailService,
  CryptoHelper,
  updateProfile,
  requestPasswordReset,
  resetPassword
} from '../dataset/06_user_controller.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updateProfile', () => {
  test('should update profile successfully with all valid fields', async () => {
    const req = {
      user: { id: 'user-1' },
      body: {
        name: '  Alice ',
        bio: 'Hello world',
        phone: '+12345678901',
        avatarUrl: 'https://example.com/avatar.png'
      }
    };
    const res = mockRes();

    jest.spyOn(User, 'findById').mockResolvedValue({ id: 'user-1' });
    jest.spyOn(User, 'update').mockImplementation(async (id, updates) => ({
      id,
      ...updates
    }));

    await updateProfile(req, res);

    expect(User.findById).toHaveBeenCalledWith('user-1');
    expect(User.update).toHaveBeenCalledWith('user-1', {
      name: 'Alice',
      bio: 'Hello world',
      phone: '+12345678901',
      avatarUrl: 'https://example.com/avatar.png'
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Profile updated successfully',
        data: expect.objectContaining({ id: 'user-1' })
      })
    );
  });

  test('should return 401 when authentication is missing', async () => {
    const req = { params: {}, body: {} };
    const res = mockRes();

    await updateProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('should return 404 when user not found', async () => {
    const req = { user: { id: 'nonexistent' }, body: {} };
    const res = mockRes();

    jest.spyOn(User, 'findById').mockResolvedValue(null);

    await updateProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User not found'
    });
  });

  test('should validate name cannot be empty', async () => {
    const req = { user: { id: 'u' }, body: { name: '   ' } };
    const res = mockRes();

    jest.spyOn(User, 'findById').mockResolvedValue({ id: 'u' });

    await updateProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Name cannot be empty'
    });
  });

  test('should validate bio length limit', async () => {
    const longBio = 'a'.repeat(251);
    const req = { user: { id: 'u' }, body: { bio: longBio } };
    const res = mockRes();

    jest.spyOn(User, 'findById').mockResolvedValue({ id: 'u' });

    await updateProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Bio must be a string up to 250 characters'
    });
  });

  test('should validate phone format', async () => {
    const req = { user: { id: 'u' }, body: { phone: '12345' } };
    const res = mockRes();

    jest.spyOn(User, 'findById').mockResolvedValue({ id: 'u' });

    await updateProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid international phone number format'
    });
  });

  test('should validate avatar URL', async () => {
    const req = { user: { id: 'u' }, body: { avatarUrl: 'not-a-url' } };
    const res = mockRes();

    jest.spyOn(User, 'findById').mockResolvedValue({ id: 'u' });

    await updateProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid avatar URL'
    });
  });
});

describe('requestPasswordReset', () => {
  test('should require email', async () => {
    const req = { body: {} };
    const res = mockRes();

    await requestPasswordReset(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Email is required'
    });
  });

  test('should validate email format', async () => {
    const req = { body: { email: 'invalid-email' } };
    const res = mockRes();

    await requestPasswordReset(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid email format'
    });
  });

  test('should respond with generic success when user not found', async () => {
    const req = { body: { email: 'nosuch@example.com' } };
    const res = mockRes();

    jest.spyOn(User, 'findByEmail').mockResolvedValue(null);

    await requestPasswordReset(req, res);

    expect(User.findByEmail).toHaveBeenCalledWith('nosuch@example.com');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'If an account exists with that email, a password reset link has been dispatched'
    });
  });

  test('should process reset for existing user', async () => {
    const req = { body: { email: 'User@Example.com' } };
    const res = mockRes();

    const mockUser = { id: 'uid', email: 'user@example.com' };
    jest.spyOn(User, 'findByEmail').mockResolvedValue(mockUser);
    jest.spyOn(User, 'saveResetToken').mockResolvedValue(true);
    jest.spyOn(EmailService, 'sendResetEmail').mockResolvedValue(true);
    jest.spyOn(CryptoHelper, 'generateToken').mockReturnValue('generated-token');

    await requestPasswordReset(req, res);

    expect(User.findByEmail).toHaveBeenCalledWith('user@example.com');
    expect(CryptoHelper.generateToken).toHaveBeenCalled();
    expect(User.saveResetToken).toHaveBeenCalledWith(
      'uid',
      'generated-token',
      expect.any(Date)
    );
    expect(EmailService.sendResetEmail).toHaveBeenCalledWith(
      'user@example.com',
      'generated-token'
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'If an account exists with that email, a password reset link has been dispatched'
    });
  });
});

describe('resetPassword', () => {
  test('should require token and newPassword', async () => {
    const req = { body: {} };
    const res = mockRes();

    await resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Token and newPassword are required'
    });
  });

  test('should enforce password length', async () => {
    const req = { body: { token: 't', newPassword: 'short' } };
    const res = mockRes();

    await resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'New password must be at least 8 characters long'
    });
  });

  test('should return error for invalid token', async () => {
    const req = { body: { token: 'bad-token', newPassword: 'validPass123' } };
    const res = mockRes();

    jest.spyOn(User, 'findByResetToken').mockResolvedValue(null);

    await resetPassword(req, res);

    expect(User.findByResetToken).toHaveBeenCalledWith('bad-token');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid or expired password reset token'
    });
  });

  test('should return error for expired token', async () => {
    const past = new Date(Date.now() - 1000);
    const req = { body: { token: 'exp-token', newPassword: 'validPass123' } };
    const res = mockRes();

    const mockUser = {
      id: 'uid',
      resetTokenExpires: past.toISOString()
    };
    jest.spyOn(User, 'findByResetToken').mockResolvedValue(mockUser);

    await resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Password reset token has expired'
    });
  });

  test('should reset password successfully', async () => {
    const req = { body: { token: 'good-token', newPassword: 'newStrongPass' } };
    const res = mockRes();

    const mockUser = { id: 'uid' };
    jest.spyOn(User, 'findByResetToken').mockResolvedValue(mockUser);
    jest.spyOn(CryptoHelper, 'hashPassword').mockResolvedValue('hashed-newStrongPass');
    jest.spyOn(User, 'update').mockResolvedValue(true);

    await resetPassword(req, res);

    expect(User.findByResetToken).toHaveBeenCalledWith('good-token');
    expect(CryptoHelper.hashPassword).toHaveBeenCalledWith('newStrongPass');
    expect(User.update).toHaveBeenCalledWith('uid', {
      password: 'hashed-newStrongPass',
      resetToken: null,
      resetTokenExpires: null
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Password has been successfully reset'
    });
  });
});