import { jest } from '@jest/globals';
import {
  setup2FA,
  verifyAndEnable2FA,
  disable2FA,
  UserMFA,
  TOTPService
} from '../dataset/22_twofactor_controller.js';

describe('Two‑Factor Authentication Controllers', () => {
  const mockRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /* ---------- setup2FA ---------- */
  describe('setup2FA', () => {
    it('should return 401 when userId is missing', async () => {
      const req = { user: null, body: {} };
      const res = mockRes();

      await setup2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 when MFA is already enabled', async () => {
      const req = { user: { id: 'u1', email: 'a@b.c' } };
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ mfaEnabled: true });

      await setup2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Two-factor authentication is already active for this account'
      });
    });

    it('should initiate MFA setup and return secret data', async () => {
      const req = { user: { id: 'u2', email: 'test@example.com' } };
      const res = mockRes();

      const userFindMock = jest.spyOn(UserMFA, 'findById').mockResolvedValue(null);
      const saveSecretMock = jest.spyOn(UserMFA, 'savePendingSecret').mockResolvedValue(true);
      const generateSecretMock = jest.spyOn(TOTPService, 'generateSecret').mockImplementation(email => ({
        secret: 'SECRET123',
        otpAuthUrl: `otpauth://totp/App:${email}?secret=SECRET123`,
        qrCodeDataUrl: 'data:image/png;base64,xyz'
      }));

      await setup2FA(req, res);

      expect(userFindMock).toHaveBeenCalledWith('u2');
      expect(generateSecretMock).toHaveBeenCalledWith('test@example.com');
      expect(saveSecretMock).toHaveBeenCalledWith('u2', 'SECRET123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'MFA setup initiated. Verify code to complete activation.',
        data: {
          secret: 'SECRET123',
          otpAuthUrl: expect.any(String),
          qrCodeDataUrl: 'data:image/png;base64,xyz'
        }
      });
    });
  });

  /* ---------- verifyAndEnable2FA ---------- */
  describe('verifyAndEnable2FA', () => {
    it('should return 401 when userId is missing', async () => {
      const req = { body: { token: '123456' } };
      const res = mockRes();

      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 when token is missing', async () => {
      const req = { user: { id: 'u3' }, body: {} };
      const res = mockRes();

      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'A 6-digit TOTP verification code is required'
      });
    });

    it('should return 400 when token is not 6 digits', async () => {
      const req = { user: { id: 'u3' }, body: { token: '12ab34' } };
      const res = mockRes();

      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Verification code must be exactly 6 digits'
      });
    });

    it('should return 400 when no pending MFA setup is found', async () => {
      const req = { user: { id: 'u4' }, body: { token: '123456' } };
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({}); // no pendingMfaSecret

      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'No pending 2FA setup found. Initiate setup first.'
      });
    });

    it('should return 400 when token verification fails', async () => {
      const req = { user: { id: 'u5' }, body: { token: '654321' } };
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ pendingMfaSecret: 'SECRETXYZ' });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(false);

      await verifyAndEnable2FA(req, res);

      expect(TOTPService.verifyToken).toHaveBeenCalledWith('SECRETXYZ', '654321');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid or expired 2FA verification code'
      });
    });

    it('should enable MFA and return backup codes on success', async () => {
      const req = { user: { id: 'u6' }, body: { token: '123456' } };
      const res = mockRes();

      const user = { pendingMfaSecret: 'VALIDSECRET' };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue(user);
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(true);
      const generateBackupMock = jest.spyOn(TOTPService, 'generateBackupCodes')
        .mockImplementation(() => ['CODE1', 'CODE2']);
      const enableMFAMock = jest.spyOn(UserMFA, 'enableMFA').mockResolvedValue(true);

      await verifyAndEnable2FA(req, res);

      expect(TOTPService.verifyToken).toHaveBeenCalledWith('VALIDSECRET', '123456');
      expect(generateBackupMock).toHaveBeenCalled();
      expect(enableMFAMock).toHaveBeenCalledWith('u6', 'VALIDSECRET', ['CODE1', 'CODE2']);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Two-factor authentication successfully enabled',
        data: {
          mfaEnabled: true,
          backupCodes: ['CODE1', 'CODE2']
        }
      });
    });
  });

  /* ---------- disable2FA ---------- */
  describe('disable2FA', () => {
    it('should return 401 when userId is missing', async () => {
      const req = { body: { token: '123456' } };
      const res = mockRes();

      await disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 when token is missing', async () => {
      const req = { user: { id: 'u7' }, body: {} };
      const res = mockRes();

      await disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Verification code required to disable 2FA'
      });
    });

    it('should return 400 when 2FA is not enabled for the user', async () => {
      const req = { user: { id: 'u8' }, body: { token: '123456' } };
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ mfaEnabled: false });

      await disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(4​00);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: '2FA is not enabled on this account'
      });
    });

    it('should return 401 when token verification fails', async () => {
      const req = { user: { id: 'u9' }, body: { token: '000000' } };
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({
        mfaEnabled: true,
        mfaSecret: 'SECRET9'
      });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(false);

      await disable2FA(req, res);

      expect(TOTPService.verifyToken).toHaveBeenCalledWith('SECRET9', '000000');
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid 2FA code'
      });
    });

    it('should disable MFA and respond with success', async () => {
      const req = { user: { id: 'u10' }, body: { token: '123456' } };
      const res = mockRes();

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({
        mfaEnabled: true,
        mfaSecret: 'SECRET10'
      });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(true);
      const disableMock = jest.spyOn(UserMFA, 'disableMFA').mockResolvedValue(true);

      await disable2FA(req, res);

      expect(TOTPService.verifyToken).toHaveBeenCalledWith('SECRET10', '123456');
      expect(disableMock).toHaveBeenCalledWith('u10');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Two-factor authentication has been disabled'
      });
    });
  });
});