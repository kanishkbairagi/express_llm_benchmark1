import { jest } from '@jest/globals';
import {
  updateProfile,
  requestPasswordReset,
  resetPassword,
  User,
  EmailService,
  CryptoHelper
} from '../dataset/06_user_controller.js';

describe('User Controller', () => {
  const makeRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateProfile', () => {
    it('should update profile successfully with valid fields', async () => {
      const req = {
        user: { id: 'u1' },
        body: { name: 'Alice', bio: 'Hello', phone: '+1234567890', avatarUrl: 'https://example.com/avatar.png' }
      };
      const res = makeRes();

      jest.spyOn(User, 'findById').mockResolvedValue({ id: 'u1' });
      const updateSpy = jest.spyOn(User, 'update').mockResolvedValue({
        id: 'u1',
        name: 'Alice',
        bio: 'Hello',
        phone: '+1234567890',
        avatarUrl: 'https://example.com/avatar.png'
      });

      await updateProfile(req, res);

      expect(User.findById).toHaveBeenCalledWith('u1');
      expect(updateSpy).toHaveBeenCalledWith('u1', {
        name: 'Alice',
        bio: 'Hello',
        phone: '+1234567890',
        avatarUrl: 'https://example.com/avatar.png'
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'Profile updated successfully' })
      );
    });

    it('should return 401 when authentication is missing', async () => {
      const req = { params: {}, body: {} };
      const res = makeRes();

      await updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('should return 404 when user not found', async () => {
      const req = { user: { id: 'missing' }, body: {} };
      const res = makeRes();

      jest.spyOn(User, 'findById').mockResolvedValue(null);

      await updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'User not found' }));
    });

    it('should validate name is non‑empty string', async () => {
      const req = { user: { id: 'u1' }, body: { name: '   ' } };
      const res = makeRes();

      jest.spyOn(User, 'findById').mockResolvedValue({ id: 'u1' });

      await updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Name cannot be empty' }));
    });

    it('should validate bio length', async () => {
      const longBio = 'a'.repeat(251);
      const req = { user: { id: 'u1' }, body: { bio: longBio } };
      const res = makeRes();

      jest.spyOn(User, 'findById').mockResolvedValue({ id: 'u1' });

      await updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Bio must be a string up to 250 characters' }));
    });

    it('should validate international phone format', async () => {
      const req = { user: { id: 'u1' }, body: { phone: '12345' } };
      const res = makeRes();

      jest.spyOn(User, 'findById').mockResolvedValue({ id: 'u1' });

      await updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid international phone number format' }));
    });

    it('should validate avatar URL', async () => {
      const req = { user: { id: 'u1' }, body: { avatarUrl: 'not-a-url' } };
      const res = makeRes();

      jest.spyOn(User, 'findById').mockResolvedValue({ id: 'u1' });

      await updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid avatar URL' }));
    });
  });

  describe('requestPasswordReset', () => {
    it('should require email', async () => {
      const req = { body: {} };
      const res = makeRes();

      await requestPasswordReset(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Email is required' }));
    });

    it('should validate email format', async () => {
      const req = { body: { email: 'invalid-email' } };
      const res = makeRes();

      await requestPasswordReset(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid email format' }));
    });

    it('should respond with generic success when email not found', async () => {
      const req = { body: { email: 'unknown@example.com' } };
      const res = makeRes();

      jest.spyOn(User, 'findByEmail').mockResolvedValue(null);
      const saveSpy = jest.spyOn(User, 'saveResetToken');
      const emailSpy = jest.spyOn(EmailService, 'sendResetEmail');

      await requestPasswordReset(req, res);

      expect(User.findByEmail).toHaveBeenCalledWith('unknown@example.com');
      expect(saveSpy).not.toHaveBeenCalled();
      expect(emailSpy).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should generate token, save it, and send email for existing user', async () => {
      const req = { body: { email: 'USER@Example.Com' } };
      const res = makeRes();

      const user = { id: 'u2', email: 'user@example.com' };
      jest.spyOn(User, 'findByEmail').mockResolvedValue(user);
      const saveSpy = jest.spyOn(User, 'saveResetToken').mockResolvedValue(true);
      const emailSpy = jest.spyOn(EmailService, 'sendResetEmail').mockResolvedValue(true);
      const tokenSpy = jest.spyOn(CryptoHelper, 'generateToken').mockReturnValue('generated-token');

      await requestPasswordReset(req, res);

      expect(User.findByEmail).toHaveBeenCalledWith('user@example.com');
      expect(tokenSpy).toHaveBeenCalled();
      expect(saveSpy).toHaveBeenCalledWith('u2', 'generated-token', expect.any(Date));
      expect(emailSpy).toHaveBeenCalledWith('user@example.com', 'generated-token');
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('resetPassword', () => {
    it('should require token and newPassword', async () => {
      const req = { body: {} };
      const res = makeRes();

      await resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Token and newPassword are required' }));
    });

    it('should enforce minimum password length', async () => {
      const req = { body: { token: 't', newPassword: 'short' } };
      const res = makeRes();

      await resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'New password must be at least 8 characters long' }));
    });

    it('should return error for invalid token', async () => {
      const req = { body: { token: 'invalid', newPassword: 'validPass123' } };
      const res = makeRes();

      jest.spyOn(User, 'findByResetToken').mockResolvedValue(null);

      await resetPassword(req, res);

      expect(User.findByResetToken).toHaveBeenCalledWith('invalid');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid or expired password reset token' }));
    });

    it('should reject expired token', async () => {
      const req = { body: { token: 'expiring', newPassword: 'validPass123' } };
      const res = makeRes();

      const pastDate = new Date(Date.now() - 1000);
      jest.spyOn(User, 'findByResetToken').mockResolvedValue({
        id: 'u3',
        resetTokenExpires: pastDate.toISOString()
      });

      await resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Password reset token has expired' }));
    });

    it('should reset password successfully', async () => {
      const req = { body: { token: 'valid', newPassword: 'newStrongPass' } };
      const res = makeRes();

      const user = { id: 'u4', resetTokenExpires: new Date(Date.now() + 60000).toISOString() };
      jest.spyOn(User, 'findByResetToken').mockResolvedValue(user);
      const hashSpy = jest.spyOn(CryptoHelper, 'hashPassword').mockResolvedValue('hashed-newStrongPass');
      const updateSpy = jest.spyOn(User, 'update').mockResolvedValue({});

      await resetPassword(req, res);

      expect(hashSpy).toHaveBeenCalledWith('newStrongPass');
      expect(updateSpy).toHaveBeenCalledWith('u4', {
        password: 'hashed-newStrongPass',
        resetToken: null,
        resetTokenExpires: null
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, message: 'Password has been successfully reset' }));
    });
  });
});