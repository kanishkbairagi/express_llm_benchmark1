import { jest } from '@jest/globals';
import {
  UserMFA,
  TOTPService,
  setup2FA,
  verifyAndEnable2FA,
  disable2FA
} from '../dataset/22_twofactor_controller.js';

describe('22_twofactor_controller unit tests', () => {
  let mockRes;

  const createMockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    mockRes = createMockRes();
    jest.restoreAllMocks();
  });

  describe('UserMFA & TOTPService default implementations', () => {
    test('UserMFA default methods return expected default values', async () => {
      await expect(UserMFA.findById('123')).resolves.toBeNull();
      await expect(UserMFA.savePendingSecret('123', 'secret')).resolves.toBe(true);
      await expect(UserMFA.enableMFA('123', 'secret', [])).resolves.toBe(true);
      await expect(UserMFA.disableMFA('123')).resolves.toBe(true);
    });

    test('TOTPService generateSecret returns formatted secret data', () => {
      const email = 'test@domain.com';
      const result = TOTPService.generateSecret(email);
      expect(result).toHaveProperty('secret', 'JBSWY3DPEHPK3PXP');
      expect(result.otpAuthUrl).toContain(email);
      expect(result).toHaveProperty('qrCodeDataUrl');
    });

    test('TOTPService verifyToken validates matching 123456 token', () => {
      expect(TOTPService.verifyToken('secret', '123456')).toBe(true);
      expect(TOTPService.verifyToken('secret', '000000')).toBe(false);
    });

    test('TOTPService generateBackupCodes generates default array of 8 codes', () => {
      const codes = TOTPService.generateBackupCodes();
      expect(Array.isArray(codes)).toBe(true);
      expect(codes.length).toBe(8);
      expect(codes[0]).toMatch(/^BACKUP-1-/);
    });

    test('TOTPService generateBackupCodes respects custom count', () => {
      const codes = TOTPService.generateBackupCodes(3);
      expect(codes.length).toBe(3);
    });
  });

  describe('setup2FA', () => {
    test('should return 401 if userId is missing', async () => {
      const req = { user: {}, body: {} };
      await setup2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 if user already has MFA enabled', async () => {
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'user1', mfaEnabled: true });

      const req = { user: { id: 'user1', email: 'user@test.com' } };
      await setup2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Two-factor authentication is already active for this account'
      });
    });

    test('should return 200 and setup data when initiated from req.user', async () => {
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'user1', mfaEnabled: false });
      jest.spyOn(UserMFA, 'savePendingSecret').mockResolvedValue(true);

      const req = { user: { id: 'user1', email: 'user@test.com' } };
      await setup2FA(req, mockRes);

      expect(UserMFA.savePendingSecret).toHaveBeenCalledWith('user1', 'JBSWY3DPEHPK3PXP');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'MFA setup initiated. Verify code to complete activation.',
        data: expect.objectContaining({
          secret: 'JBSWY3DPEHPK3PXP'
        })
      });
    });

    test('should return 200 using req.body fallback values if req.user is absent', async () => {
      jest.spyOn(UserMFA, 'findById').mockResolvedValue(null);
      jest.spyOn(UserMFA, 'savePendingSecret').mockResolvedValue(true);

      const req = { body: { userId: 'user2', email: 'fallback@test.com' } };
      await setup2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true
        })
      );
    });

    test('should return 500 when an internal error occurs', async () => {
      jest.spyOn(UserMFA, 'findById').mockRejectedValue(new Error('Database error'));

      const req = { user: { id: 'user1' } };
      await setup2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to initiate 2FA setup',
        details: 'Database error'
      });
    });
  });

  describe('verifyAndEnable2FA', () => {
    test('should return 401 if userId is missing', async () => {
      const req = { body: { token: '123456' } };
      await verifyAndEnable2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 if token is missing or not a string', async () => {
      const req = { user: { id: 'user1' }, body: { token: 123456 } };
      await verifyAndEnable2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'A 6-digit TOTP verification code is required'
      });
    });

    test('should return 400 if token is not exactly 6 digits', async () => {
      const req = { user: { id: 'user1' }, body: { token: '12345' } };
      await verifyAndEnable2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Verification code must be exactly 6 digits'
      });
    });

    test('should return 400 if user or pendingMfaSecret is not found', async () => {
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'user1' });

      const req = { user: { id: 'user1' }, body: { token: '123456' } };
      await verifyAndEnable2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'No pending 2FA setup found. Initiate setup first.'
      });
    });

    test('should return 400 if token verification fails', async () => {
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({
        id: 'user1',
        pendingMfaSecret: 'SECRET123'
      });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(false);

      const req = { user: { id: 'user1' }, body: { token: '654321' } };
      await verifyAndEnable2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid or expired 2FA verification code'
      });
    });

    test('should return 200 and backup codes on successful verification', async () => {
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({
        id: 'user1',
        pendingMfaSecret: 'SECRET123'
      });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(true);
      jest.spyOn(UserMFA, 'enableMFA').mockResolvedValue(true);

      const req = { user: { id: 'user1' }, body: { token: ' 123456 ' } };
      await verifyAndEnable2FA(req, mockRes);

      expect(UserMFA.enableMFA).toHaveBeenCalledWith('user1', 'SECRET123', expect.any(Array));
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Two-factor authentication successfully enabled',
        data: expect.objectContaining({
          mfaEnabled: true,
          backupCodes: expect.any(Array)
        })
      });
    });

    test('should return 500 when an internal error occurs', async () => {
      jest.spyOn(UserMFA, 'findById').mockRejectedValue(new Error('Internal failure'));

      const req = { user: { id: 'user1' }, body: { token: '123456' } };
      await verifyAndEnable2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to verify and activate 2FA',
        details: 'Internal failure'
      });
    });
  });

  describe('disable2FA', () => {
    test('should return 401 if userId is missing', async () => {
      const req = { body: { token: '123456' } };
      await disable2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 if token is missing', async () => {
      const req = { user: { id: 'user1' }, body: {} };
      await disable2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Verification code required to disable 2FA'
      });
    });

    test('should return 400 if user is not found or mfaEnabled is false', async () => {
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'user1', mfaEnabled: false });

      const req = { user: { id: 'user1' }, body: { token: '123456' } };
      await disable2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: '2FA is not enabled on this account'
      });
    });

    test('should return 401 if token is invalid', async () => {
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({
        id: 'user1',
        mfaEnabled: true,
        mfaSecret: 'SECRET123'
      });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(false);

      const req = { user: { id: 'user1' }, body: { token: '000000' } };
      await disable2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid 2FA code'
      });
    });

    test('should return 200 when 2FA is successfully disabled', async () => {
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({
        id: 'user1',
        mfaEnabled: true,
        mfaSecret: 'SECRET123'
      });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(true);
      jest.spyOn(UserMFA, 'disableMFA').mockResolvedValue(true);

      const req = { user: { id: 'user1' }, body: { token: '123456' } };
      await disable2FA(req, mockRes);

      expect(UserMFA.disableMFA).toHaveBeenCalledWith('user1');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Two-factor authentication has been disabled'
      });
    });

    test('should return 500 when an internal error occurs', async () => {
      jest.spyOn(UserMFA, 'findById').mockRejectedValue(new Error('Database connection failed'));

      const req = { user: { id: 'user1' }, body: { token: '123456' } };
      await disable2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to disable 2FA',
        details: 'Database connection failed'
      });
    });
  });
});