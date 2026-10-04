import { jest } from '@jest/globals';
import {
  setup2FA,
  verifyAndEnable2FA,
  disable2FA,
  UserMFA,
  TOTPService
} from '../dataset/22_twofactor_controller.js';

describe('22_twofactor_controller', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.restoreAllMocks();
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('UserMFA & TOTPService default helpers', () => {
    test('UserMFA default methods execute without error', async () => {
      await expect(UserMFA.findById('1')).resolves.toBeNull();
      await expect(UserMFA.savePendingSecret('1', 'sec')).resolves.toBe(true);
      await expect(UserMFA.enableMFA('1', 'sec', [])).resolves.toBe(true);
      await expect(UserMFA.disableMFA('1')).resolves.toBe(true);
    });

    test('TOTPService default methods return expected structures', () => {
      const secretObj = TOTPService.generateSecret('test@example.com');
      expect(secretObj).toHaveProperty('secret', 'JBSWY3DPEHPK3PXP');
      expect(secretObj.otpAuthUrl).toContain('test@example.com');

      expect(TOTPService.verifyToken('sec', '123456')).toBe(true);
      expect(TOTPService.verifyToken('sec', '654321')).toBe(false);

      const codes = TOTPService.generateBackupCodes(5);
      expect(codes).toHaveLength(5);
      expect(codes[0]).toMatch(/^BACKUP-1-/);
    });
  });

  describe('setup2FA', () => {
    test('returns 401 if userId is missing', async () => {
      req = { body: {} };
      await setup2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('returns 400 if user already has MFA enabled', async () => {
      req = { user: { id: 'u1', email: 'test@domain.com' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'u1', mfaEnabled: true });

      await setup2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Two-factor authentication is already active for this account'
      });
    });

    test('returns 200 and setup data on success', async () => {
      req = { body: { userId: 'u2', email: 'user2@domain.com' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue(null);
      jest.spyOn(UserMFA, 'savePendingSecret').mockResolvedValue(true);

      await setup2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'MFA setup initiated. Verify code to complete activation.',
          data: {
            secret: 'JBSWY3DPEHPK3PXP',
            otpAuthUrl: expect.stringContaining('user2@domain.com'),
            qrCodeDataUrl: 'data:image/png;base64,mockQrCodeDataUrl'
          }
        })
      );
    });

    test('uses fallback email when email is not provided', async () => {
      req = { user: { id: 'u3' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue(null);
      const generateSecretSpy = jest.spyOn(TOTPService, 'generateSecret');

      await setup2FA(req, res);
      expect(generateSecretSpy).toHaveBeenCalledWith('user@example.com');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('returns 500 when an exception occurs', async () => {
      req = { user: { id: 'u4' } };
      jest.spyOn(UserMFA, 'findById').mockRejectedValue(new Error('Database error'));

      await setup2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to initiate 2FA setup',
        details: 'Database error'
      });
    });
  });

  describe('verifyAndEnable2FA', () => {
    test('returns 401 if userId is missing', async () => {
      req = { body: { token: '123456' } };
      await verifyAndEnable2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('returns 400 if token is missing or non-string', async () => {
      req = { user: { id: 'u1' }, body: {} };
      await verifyAndEnable2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      req = { user: { id: 'u1' }, body: { token: 123456 } };
      await verifyAndEnable2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'A 6-digit TOTP verification code is required'
      });
    });

    test('returns 400 if token format is not 6 digits', async () => {
      req = { user: { id: 'u1' }, body: { token: '12345' } };
      await verifyAndEnable2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Verification code must be exactly 6 digits'
      });
    });

    test('returns 400 if user or pendingMfaSecret is missing', async () => {
      req = { user: { id: 'u1' }, body: { token: '123456' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue(null);

      await verifyAndEnable2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'No pending 2FA setup found. Initiate setup first.'
      });

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'u1' });
      await verifyAndEnable2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('returns 400 if TOTP verification fails', async () => {
      req = { user: { id: 'u1' }, body: { token: '654321' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'u1', pendingMfaSecret: 'SEC' });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(false);

      await verifyAndEnable2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid or expired 2FA verification code'
      });
    });

    test('returns 200 and enables MFA on valid token', async () => {
      req = { user: { id: 'u1' }, body: { token: '  123456  ' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'u1', pendingMfaSecret: 'SEC' });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(true);
      const enableSpy = jest.spyOn(UserMFA, 'enableMFA').mockResolvedValue(true);

      await verifyAndEnable2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(enableSpy).toHaveBeenCalledWith('u1', 'SEC', expect.any(Array));
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Two-factor authentication successfully enabled',
        data: {
          mfaEnabled: true,
          backupCodes: expect.any(Array)
        }
      });
    });

    test('returns 500 when error occurs during verification', async () => {
      req = { user: { id: 'u1' }, body: { token: '123456' } };
      jest.spyOn(UserMFA, 'findById').mockRejectedValue(new Error('DB Fail'));

      await verifyAndEnable2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to verify and activate 2FA',
        details: 'DB Fail'
      });
    });
  });

  describe('disable2FA', () => {
    test('returns 401 if userId is missing', async () => {
      req = { body: { token: '123456' } };
      await disable2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('returns 400 if token is missing', async () => {
      req = { user: { id: 'u1' }, body: {} };
      await disable2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Verification code required to disable 2FA'
      });
    });

    test('returns 400 if user or mfaEnabled is false', async () => {
      req = { user: { id: 'u1' }, body: { token: '123456' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'u1', mfaEnabled: false });

      await disable2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: '2FA is not enabled on this account'
      });
    });

    test('returns 401 if token is invalid', async () => {
      req = { user: { id: 'u1' }, body: { token: '000000' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'u1', mfaEnabled: true, mfaSecret: 'SEC' });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(false);

      await disable2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid 2FA code'
      });
    });

    test('returns 200 and disables 2FA on valid token', async () => {
      req = { user: { id: 'u1' }, body: { token: '123456' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'u1', mfaEnabled: true, mfaSecret: 'SEC' });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(true);
      const disableSpy = jest.spyOn(UserMFA, 'disableMFA').mockResolvedValue(true);

      await disable2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(disableSpy).toHaveBeenCalledWith('u1');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Two-factor authentication has been disabled'
      });
    });

    test('returns 500 on unexpected exception', async () => {
      req = { user: { id: 'u1' }, body: { token: '123456' } };
      jest.spyOn(UserMFA, 'findById').mockRejectedValue(new Error('Fatal error'));

      await disable2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to disable 2FA',
        details: 'Fatal error'
      });
    });
  });
});