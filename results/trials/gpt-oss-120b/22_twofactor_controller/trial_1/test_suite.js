import { jest } from '@jest/globals';
import {
  setup2FA,
  verifyAndEnable2FA,
  disable2FA,
  UserMFA,
  TOTPService
} from '../dataset/22_twofactor_controller.js';

describe('Two-factor authentication controller', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------- setup2FA ----------
  describe('setup2FA', () => {
    test('returns 401 when userId is missing', async () => {
      const req = { body: {} };
      const res = mockRes();

      await setup2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('returns 400 when MFA already enabled', async () => {
      const req = { user: { id: 'u1', email: 'test@example.com' } };
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ mfaEnabled: true });

      await setup2FA(req, res);

      expect(UserMFA.findById).toHaveBeenCalledWith('u1');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Two-factor authentication is already active for this account'
      });
    });

    test('successfully initiates MFA setup', async () => {
      const req = { user: { id: 'u2', email: 'alice@example.com' } };
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue(null);
      const saveSpy = jest.spyOn(UserMFA, 'savePendingSecret').mockResolvedValue(true);
      const generateSecretSpy = jest.spyOn(TOTPService, 'generateSecret');

      await setup2FA(req, res);

      expect(UserMFA.findById).toHaveBeenCalledWith('u2');
      expect(generateSecretSpy).toHaveBeenCalledWith('alice@example.com');
      expect(saveSpy).toHaveBeenCalledWith('u2', 'JBSWY3DPEHPK3PXP');

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'MFA setup initiated. Verify code to complete activation.',
        data: {
          secret: 'JBSWY3DPEHPK3PXP',
          otpAuthUrl: expect.stringContaining('otpauth://totp/BenchmarkApp:alice@example.com'),
          qrCodeDataUrl: 'data:image/png;base64,mockQrCodeDataUrl'
        }
      });
    });
  });

  // ---------- verifyAndEnable2FA ----------
  describe('verifyAndEnable2FA', () => {
    test('returns 401 when userId is missing', async () => {
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
      const req = { user: { id: 'u3' }, body: {} };
      const res = mockRes();

      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'A 6-digit TOTP verification code is required'
      });
    });

    test('returns 400 when token format is invalid', async () => {
      const req = { user: { id: 'u3' }, body: { token: '12ab56' } };
      const res = mockRes();

      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Verification code must be exactly 6 digits'
      });
    });

    test('returns 400 when no pending secret exists', async () => {
      const req = { user: { id: 'u4' }, body: { token: '123456' } };
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({});

      await verifyAndEnable2FA(req, res);

      expect(UserMFA.findById).toHaveBeenCalledWith('u4');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'No pending 2FA setup found. Initiate setup first.'
      });
    });

    test('returns 400 when token verification fails', async () => {
      const req = { user: { id: 'u5' }, body: { token: '000000' } };
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ pendingMfaSecret: 'secretX' });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(false);

      await verifyAndEnable2FA(req, res);

      expect(TOTPService.verifyToken).toHaveBeenCalledWith('secretX', '000000');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid or expired 2FA verification code'
      });
    });

    test('successfully enables MFA and returns backup codes', async () => {
      const req = { user: { id: 'u6' }, body: { token: '123456' } };
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ pendingMfaSecret: 'secretY' });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(true);
      const backupMock = ['CODE-1', 'CODE-2', 'CODE-3', 'CODE-4', 'CODE-5', 'CODE-6', 'CODE-7', 'CODE-8'];
      jest.spyOn(TOTPService, 'generateBackupCodes').mockReturnValue(backupMock);
      const enableSpy = jest.spyOn(UserMFA, 'enableMFA').mockResolvedValue(true);

      await verifyAndEnable2FA(req, res);

      expect(TOTPService.verifyToken).toHaveBeenCalledWith('secretY', '123456');
      expect(TOTPService.generateBackupCodes).toHaveBeenCalled();
      expect(enableSpy).toHaveBeenCalledWith('u6', 'secretY', backupMock);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Two-factor authentication successfully enabled',
        data: {
          mfaEnabled: true,
          backupCodes: backupMock
        }
      });
    });
  });

  // ---------- disable2FA ----------
  describe('disable2FA', () => {
    test('returns 401 when userId is missing', async () => {
      const req = { body: {} };
      const res = mockRes();

      await disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('returns 400 when token is missing', async () => {
      const req = { user: { id: 'u7' }, body: {} };
      const res = mockRes();

      await disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Verification code required to disable 2FA'
      });
    });

    test('returns 400 when MFA not enabled for user', async () => {
      const req = { user: { id: 'u8' }, body: { token: '123456' } };
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ mfaEnabled: false });

      await disable2FA(req, res);

      expect(UserMFA.findById).toHaveBeenCalledWith('u8');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: '2FA is not enabled on this account'
      });
    });

    test('returns 401 when token verification fails', async () => {
      const req = { user: { id: 'u9' }, body: { token: '999999' } };
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ mfaEnabled: true, mfaSecret: 'secretZ' });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(false);

      await disable2FA(req, res);

      expect(TOTPService.verifyToken).toHaveBeenCalledWith('secretZ', '999999');
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid 2FA code'
      });
    });

    test('successfully disables MFA', async () => {
      const req = { user: { id: 'u10' }, body: { token: '123456' } };
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ mfaEnabled: true, mfaSecret: 'secretA' });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(true);
      const disableSpy = jest.spyOn(UserMFA, 'disableMFA').mockResolvedValue(true);

      await disable2FA(req, res);

      expect(TOTPService.verifyToken).toHaveBeenCalledWith('secretA', '123456');
      expect(disableSpy).toHaveBeenCalledWith('u10');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Two-factor authentication has been disabled'
      });
    });
  });
});