import { jest } from '@jest/globals';
import {
  setup2FA,
  verifyAndEnable2FA,
  disable2FA,
  UserMFA,
  TOTPService
} from '../dataset/22_twofactor_controller.js';

describe('Two-Factor Authentication Controllers', () => {
  const mockRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------- setup2FA ----------
  describe('setup2FA', () => {
    test('returns 401 when user is not authenticated', async () => {
      const req = { body: {} };
      const res = mockRes();

      await setup2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('returns 400 when MFA is already enabled', async () => {
      const req = { user: { id: 'u1', email: 'test@example.com' } };
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ mfaEnabled: true });

      await setup2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Two-factor authentication is already active for this account'
      });
    });

    test('initiates MFA setup successfully', async () => {
      const req = { user: { id: 'u1', email: 'test@example.com' } };
      const res = mockRes();

      const secretData = {
        secret: 'SECRET123',
        otpAuthUrl: 'otpauth://totp/BenchmarkApp:test@example.com?secret=SECRET123&issuer=BenchmarkApp',
        qrCodeDataUrl: 'data:image/png;base64,xyz'
      };

      jest.spyOn(UserMFA, 'findById').mockResolvedValue(null);
      jest.spyOn(UserMFA, 'savePendingSecret').mockResolvedValue(true);
      jest.spyOn(TOTPService, 'generateSecret').mockReturnValue(secretData);

      await setup2FA(req, res);

      expect(UserMFA.savePendingSecret).toHaveBeenCalledWith('u1', secretData.secret);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'MFA setup initiated. Verify code to complete activation.',
        data: secretData
      });
    });

    test('handles unexpected errors with 500', async () => {
      const req = { user: { id: 'u1', email: 'test@example.com' } };
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockRejectedValue(new Error('DB failure'));

      await setup2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Failed to initiate 2FA setup',
        details: 'DB failure'
      }));
    });
  });

  // ---------- verifyAndEnable2FA ----------
  describe('verifyAndEnable2FA', () => {
    const baseReq = (userId, token) => ({
      user: { id: userId },
      body: { token }
    });

    test('returns 401 when user is not authenticated', async () => {
      const req = { body: { token: '123456' } };
      const res = mockRes();

      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('returns 400 when token is missing', async () => {
      const req = baseReq('u1', undefined);
      const res = mockRes();

      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'A 6-digit TOTP verification code is required'
      });
    });

    test('returns 400 when token format is invalid', async () => {
      const req = baseReq('u1', '12ab34');
      const res = mockRes();

      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Verification code must be exactly 6 digits'
      });
    });

    test('returns 400 when no pending MFA setup exists', async () => {
      const req = baseReq('u1', '123456');
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({});

      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'No pending 2FA setup found. Initiate setup first.'
      });
    });

    test('returns 400 when verification token is invalid', async () => {
      const req = baseReq('u1', '000000');
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ pendingMfaSecret: 'SECRET' });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(false);

      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid or expired 2FA verification code'
      });
    });

    test('enables MFA successfully and returns backup codes', async () => {
      const req = baseReq('u1', '123456');
      const res = mockRes();

      const backupCodesMock = ['CODE1', 'CODE2', 'CODE3', 'CODE4', 'CODE5', 'CODE6', 'CODE7', 'CODE8'];

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ pendingMfaSecret: 'SECRET' });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(true);
      jest.spyOn(TOTPService, 'generateBackupCodes').mockReturnValue(backupCodesMock);
      jest.spyOn(UserMFA, 'enableMFA').mockResolvedValue(true);

      await verifyAndEnable2FA(req, res);

      expect(UserMFA.enableMFA).toHaveBeenCalledWith('u1', 'SECRET', backupCodesMock);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Two-factor authentication successfully enabled',
        data: {
          mfaEnabled: true,
          backupCodes: backupCodesMock
        }
      });
    });

    test('catches unexpected errors and returns 500', async () => {
      const req = baseReq('u1', '123456');
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockRejectedValue(new Error('DB error'));

      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Failed to verify and activate 2FA',
        details: 'DB error'
      }));
    });
  });

  // ---------- disable2FA ----------
  describe('disable2FA', () => {
    const baseReq = (userId, token) => ({
      user: { id: userId },
      body: { token }
    });

    test('returns 401 when user is not authenticated', async () => {
      const req = { body: { token: '123456' } };
      const res = mockRes();

      await disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('returns 400 when token is missing', async () => {
      const req = baseReq('u1', undefined);
      const res = mockRes();

      await disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Verification code required to disable 2FA'
      });
    });

    test('returns 400 when MFA is not enabled for the account', async () => {
      const req = baseReq('u1', '123456');
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ mfaEnabled: false });

      await disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: '2FA is not enabled on this account'
      });
    });

    test('returns 401 when provided token is invalid', async () => {
      const req = baseReq('u1', '000000');
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({
        mfaEnabled: true,
        mfaSecret: 'SECRET'
      });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(false);

      await disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid 2FA code'
      });
    });

    test('disables MFA successfully', async () => {
      const req = baseReq('u1', '123456');
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({
        mfaEnabled: true,
        mfaSecret: 'SECRET'
      });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(true);
      jest.spyOn(UserMFA, 'disableMFA').mockResolvedValue(true);

      await disable2FA(req, res);

      expect(UserMFA.disableMFA).toHaveBeenCalledWith('u1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Two-factor authentication has been disabled'
      });
    });

    test('catches unexpected errors and returns 500', async () => {
      const req = baseReq('u1', '123456');
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockRejectedValue(new Error('DB failure'));

      await disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Failed to disable 2FA',
        details: 'DB failure'
      }));
    });
  });
});