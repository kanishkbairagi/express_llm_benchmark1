import { jest } from '@jest/globals';
import {
  setup2FA,
  verifyAndEnable2FA,
  disable2FA,
  UserMFA,
  TOTPService
} from '../dataset/22_twofactor_controller.js';

describe('Two-factor authentication controller', () => {
  const makeRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------- setup2FA ----------
  describe('setup2FA', () => {
    test('returns 401 when userId is missing', async () => {
      const req = { body: {} };
      const res = makeRes();

      await setup2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('returns 400 when MFA already enabled for user', async () => {
      const req = { user: { id: 'u1', email: 'test@example.com' } };
      const res = makeRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ mfaEnabled: true });

      await setup2FA(req, res);

      expect(UserMFA.findById).toHaveBeenCalledWith('u1');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Two-factor authentication is already active for this account'
      });
    });

    test('successful initiation returns secret data', async () => {
      const req = { user: { id: 'u2', email: 'alice@example.com' } };
      const res = makeRes();

      const mockSecret = {
        secret: 'SECRET123',
        otpAuthUrl: 'otpauth://totp/BenchmarkApp:alice@example.com?secret=SECRET123&issuer=BenchmarkApp',
        qrCodeDataUrl: 'data:image/png;base64,abc'
      };

      jest.spyOn(UserMFA, 'findById').mockResolvedValue(null);
      jest.spyOn(TOTPService, 'generateSecret').mockReturnValue(mockSecret);
      const saveSpy = jest.spyOn(UserMFA, 'savePendingSecret').mockResolvedValue(true);

      await setup2FA(req, res);

      expect(TOTPService.generateSecret).toHaveBeenCalledWith('alice@example.com');
      expect(saveSpy).toHaveBeenCalledWith('u2', mockSecret.secret);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'MFA setup initiated. Verify code to complete activation.',
        data: mockSecret
      });
    });

    test('handles unexpected errors with 500', async () => {
      const req = { user: { id: 'u3' } };
      const res = makeRes();

      jest.spyOn(UserMFA, 'findById').mockRejectedValue(new Error('DB failure'));

      await setup2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to initiate 2FA setup',
        details: 'DB failure'
      });
    });
  });

  // ---------- verifyAndEnable2FA ----------
  describe('verifyAndEnable2FA', () => {
    test('returns 401 when userId missing', async () => {
      const req = { body: { token: '123456' } };
      const res = makeRes();

      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('returns 400 when token missing', async () => {
      const req = { user: { id: 'u4' }, body: {} };
      const res = makeRes();

      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'A 6-digit TOTP verification code is required'
      });
    });

    test('returns 400 when token not six digits', async () => {
      const req = { user: { id: 'u5' }, body: { token: '12a456' } };
      const res = makeRes();

      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Verification code must be exactly 6 digits'
      });
    });

    test('returns 400 when no pending MFA setup found', async () => {
      const req = { user: { id: 'u6' }, body: { token: '123456' } };
      const res = makeRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({});

      await verifyAndEnable2FA(req, res);

      expect(UserMFA.findById).toHaveBeenCalledWith('u6');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'No pending 2FA setup found. Initiate setup first.'
      });
    });

    test('returns 400 when token verification fails', async () => {
      const req = { user: { id: 'u7' }, body: { token: '123456' } };
      const res = makeRes();

      const pendingUser = { pendingMfaSecret: 'SECRET' };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue(pendingUser);
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(false);

      await verifyAndEnable2FA(req, res);

      expect(TOTPService.verifyToken).toHaveBeenCalledWith('SECRET', '123456');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid or expired 2FA verification code'
      });
    });

    test('successful verification enables MFA and returns backup codes', async () => {
      const req = { user: { id: 'u8' }, body: { token: '123456' } };
      const res = makeRes();

      const pendingUser = { pendingMfaSecret: 'SECRET' };
      const backupCodes = ['CODE1', 'CODE2', 'CODE3', 'CODE4', 'CODE5', 'CODE6', 'CODE7', 'CODE8'];

      jest.spyOn(UserMFA, 'findById').mockResolvedValue(pendingUser);
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(true);
      jest.spyOn(TOTPService, 'generateBackupCodes').mockReturnValue(backupCodes);
      const enableSpy = jest.spyOn(UserMFA, 'enableMFA').mockResolvedValue(true);

      await verifyAndEnable2FA(req, res);

      expect(TOTPService.verifyToken).toHaveBeenCalledWith('SECRET', '123456');
      expect(TOTPService.generateBackupCodes).toHaveBeenCalled();
      expect(enableSpy).toHaveBeenCalledWith('u8', 'SECRET', backupCodes);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Two-factor authentication successfully enabled',
        data: {
          mfaEnabled: true,
          backupCodes
        }
      });
    });

    test('handles unexpected errors with 500', async () => {
      const req = { user: { id: 'u9' }, body: { token: '123456' } };
      const res = makeRes();

      const pendingUser = { pendingMfaSecret: 'SECRET' };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue(pendingUser);
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(true);
      jest.spyOn(UserMFA, 'enableMFA').mockRejectedValue(new Error('DB write error'));

      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to verify and activate 2FA',
        details: 'DB write error'
      });
    });
  });

  // ---------- disable2FA ----------
  describe('disable2FA', () => {
    test('returns 401 when userId missing', async () => {
      const req = { body: { token: '123456' } };
      const res = makeRes();

      await disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('returns 400 when token missing', async () => {
      const req = { user: { id: 'u10' }, body: {} };
      const res = makeRes();

      await disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Verification code required to disable 2FA'
      });
    });

    test('returns 400 when MFA not enabled on account', async () => {
      const req = { user: { id: 'u11' }, body: { token: '123456' } };
      const res = makeRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ mfaEnabled: false });

      await disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: '2FA is not enabled on this account'
      });
    });

    test('returns 401 when verification token is invalid', async () => {
      const req = { user: { id: 'u12' }, body: { token: '654321' } };
      const res = makeRes();

      const user = { mfaEnabled: true, mfaSecret: 'SECRET' };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue(user);
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(false);

      await disable2FA(req, res);

      expect(TOTPService.verifyToken).toHaveBeenCalledWith('SECRET', '654321');
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid 2FA code'
      });
    });

    test('successful disable returns 200', async () => {
      const req = { user: { id: 'u13' }, body: { token: '123456' } };
      const res = makeRes();

      const user = { mfaEnabled: true, mfaSecret: 'SECRET' };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue(user);
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(true);
      const disableSpy = jest.spyOn(UserMFA, 'disableMFA').mockResolvedValue(true);

      await disable2FA(req, res);

      expect(TOTPService.verifyToken).toHaveBeenCalledWith('SECRET', '123456');
      expect(disableSpy).toHaveBeenCalledWith('u13');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Two-factor authentication has been disabled'
      });
    });

    test('handles unexpected errors with 500', async () => {
      const req = { user: { id: 'u14' }, body: { token: '123456' } };
      const res = makeRes();

      const user = { mfaEnabled: true, mfaSecret: 'SECRET' };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue(user);
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(true);
      jest.spyOn(UserMFA, 'disableMFA').mockRejectedValue(new Error('DB error'));

      await disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to disable 2FA',
        details: 'DB error'
      });
    });
  });
});