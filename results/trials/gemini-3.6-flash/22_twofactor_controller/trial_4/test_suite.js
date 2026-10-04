import { jest } from '@jest/globals';
import {
  UserMFA,
  TOTPService,
  setup2FA,
  verifyAndEnable2FA,
  disable2FA
} from '../dataset/22_twofactor_controller.js';

describe('22_twofactor_controller', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      body: {},
      user: null
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  describe('UserMFA Default Mock Implementations', () => {
    it('findById should default to returning null', async () => {
      const result = await UserMFA.findById('123');
      expect(result).toBeNull();
    });

    it('savePendingSecret should default to returning true', async () => {
      const result = await UserMFA.savePendingSecret('123', 'secret');
      expect(result).toBe(true);
    });

    it('enableMFA should default to returning true', async () => {
      const result = await UserMFA.enableMFA('123', 'secret', []);
      expect(result).toBe(true);
    });

    it('disableMFA should default to returning true', async () => {
      const result = await UserMFA.disableMFA('123');
      expect(result).toBe(true);
    });
  });

  describe('TOTPService Default Methods', () => {
    it('generateSecret should return secret object with expected properties', () => {
      const result = TOTPService.generateSecret('test@example.com');
      expect(result).toEqual({
        secret: 'JBSWY3DPEHPK3PXP',
        otpAuthUrl: 'otpauth://totp/BenchmarkApp:test@example.com?secret=JBSWY3DPEHPK3PXP&issuer=BenchmarkApp',
        qrCodeDataUrl: 'data:image/png;base64,mockQrCodeDataUrl'
      });
    });

    it('verifyToken should return true for 123456 and false otherwise', () => {
      expect(TOTPService.verifyToken('secret', '123456')).toBe(true);
      expect(TOTPService.verifyToken('secret', '654321')).toBe(false);
    });

    it('generateBackupCodes should generate array of specified count', () => {
      const defaultCodes = TOTPService.generateBackupCodes();
      expect(defaultCodes).toHaveLength(8);
      expect(defaultCodes[0]).toMatch(/^BACKUP-1-/);

      const customCodes = TOTPService.generateBackupCodes(4);
      expect(customCodes).toHaveLength(4);
    });
  });

  describe('setup2FA', () => {
    it('should return 401 if userId is missing', async () => {
      req.user = null;
      req.body = {};

      await setup2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 if user already has MFA enabled', async () => {
      req.user = { id: 'user1', email: 'user@test.com' };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'user1', mfaEnabled: true });

      await setup2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Two-factor authentication is already active for this account'
      });
    });

    it('should successfully initiate 2FA setup using req.user credentials', async () => {
      req.user = { id: 'user1', email: 'user@test.com' };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue(null);
      jest.spyOn(UserMFA, 'savePendingSecret').mockResolvedValue(true);

      await setup2FA(req, res);

      expect(UserMFA.savePendingSecret).toHaveBeenCalledWith('user1', 'JBSWY3DPEHPK3PXP');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'MFA setup initiated. Verify code to complete activation.',
        data: {
          secret: 'JBSWY3DPEHPK3PXP',
          otpAuthUrl: 'otpauth://totp/BenchmarkApp:user@test.com?secret=JBSWY3DPEHPK3PXP&issuer=BenchmarkApp',
          qrCodeDataUrl: 'data:image/png;base64,mockQrCodeDataUrl'
        }
      });
    });

    it('should fall back to req.body and default email if req.user is absent', async () => {
      req.user = null;
      req.body = { userId: 'bodyUser1' };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue(null);
      jest.spyOn(UserMFA, 'savePendingSecret').mockResolvedValue(true);

      await setup2FA(req, res);

      expect(UserMFA.savePendingSecret).toHaveBeenCalledWith('bodyUser1', 'JBSWY3DPEHPK3PXP');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            otpAuthUrl: expect.stringContaining('user@example.com')
          })
        })
      );
    });

    it('should return 500 when an exception occurs', async () => {
      req.user = { id: 'user1' };
      jest.spyOn(UserMFA, 'findById').mockRejectedValue(new Error('DB Error'));

      await setup2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to initiate 2FA setup',
        details: 'DB Error'
      });
    });
  });

  describe('verifyAndEnable2FA', () => {
    it('should return 401 if userId is missing', async () => {
      req.user = null;
      req.body = { token: '123456' };

      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 if token is missing or not a string', async () => {
      req.user = { id: 'user1' };
      
      req.body = {};
      await verifyAndEnable2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'A 6-digit TOTP verification code is required'
      });

      req.body = { token: 123456 };
      await verifyAndEnable2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'A 6-digit TOTP verification code is required'
      });
    });

    it('should return 400 if token format is invalid (not 6 digits)', async () => {
      req.user = { id: 'user1' };
      req.body = { token: '12345' };

      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Verification code must be exactly 6 digits'
      });
    });

    it('should return 400 if user does not exist or has no pendingMfaSecret', async () => {
      req.user = { id: 'user1' };
      req.body = { token: '123456' };

      jest.spyOn(UserMFA, 'findById').mockResolvedValue(null);
      await verifyAndEnable2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'No pending 2FA setup found. Initiate setup first.'
      });

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'user1' });
      await verifyAndEnable2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 if verification token is invalid', async () => {
      req.user = { id: 'user1' };
      req.body = { token: '654321' };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({
        id: 'user1',
        pendingMfaSecret: 'SECRET123'
      });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(false);

      await verifyAndEnable2FA(req, res);

      expect(TOTPService.verifyToken).toHaveBeenCalledWith('SECRET123', '654321');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid or expired 2FA verification code'
      });
    });

    it('should verify token and enable 2FA successfully', async () => {
      req.user = { id: 'user1' };
      req.body = { token: ' 123456 ' };
      const pendingSecret = 'PENDING_SECRET';
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({
        id: 'user1',
        pendingMfaSecret: pendingSecret
      });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(true);
      jest.spyOn(TOTPService, 'generateBackupCodes').mockReturnValue(['CODE1', 'CODE2']);
      jest.spyOn(UserMFA, 'enableMFA').mockResolvedValue(true);

      await verifyAndEnable2FA(req, res);

      expect(TOTPService.verifyToken).toHaveBeenCalledWith(pendingSecret, '123456');
      expect(UserMFA.enableMFA).toHaveBeenCalledWith('user1', pendingSecret, ['CODE1', 'CODE2']);
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

    it('should return 500 when an exception occurs', async () => {
      req.user = { id: 'user1' };
      req.body = { token: '123456' };
      jest.spyOn(UserMFA, 'findById').mockRejectedValue(new Error('Activation Error'));

      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to verify and activate 2FA',
        details: 'Activation Error'
      });
    });
  });

  describe('disable2FA', () => {
    it('should return 401 if userId is missing', async () => {
      req.user = null;
      req.body = { token: '123456' };

      await disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 if token is missing', async () => {
      req.user = { id: 'user1' };
      req.body = {};

      await disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Verification code required to disable 2FA'
      });
    });

    it('should return 400 if user does not exist or mfaEnabled is false', async () => {
      req.user = { id: 'user1' };
      req.body = { token: '123456' };

      jest.spyOn(UserMFA, 'findById').mockResolvedValue(null);
      await disable2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: '2FA is not enabled on this account'
      });

      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'user1', mfaEnabled: false });
      await disable2FA(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 401 if TOTP token is invalid', async () => {
      req.user = { id: 'user1' };
      req.body = { token: '654321' };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({
        id: 'user1',
        mfaEnabled: true,
        mfaSecret: 'USER_SECRET'
      });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(false);

      await disable2FA(req, res);

      expect(TOTPService.verifyToken).toHaveBeenCalledWith('USER_SECRET', '654321');
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid 2FA code'
      });
    });

    it('should successfully disable 2FA when valid token is provided', async () => {
      req.user = { id: 'user1' };
      req.body = { token: 123456 };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({
        id: 'user1',
        mfaEnabled: true,
        mfaSecret: 'USER_SECRET'
      });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(true);
      jest.spyOn(UserMFA, 'disableMFA').mockResolvedValue(true);

      await disable2FA(req, res);

      expect(TOTPService.verifyToken).toHaveBeenCalledWith('USER_SECRET', '123456');
      expect(UserMFA.disableMFA).toHaveBeenCalledWith('user1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Two-factor authentication has been disabled'
      });
    });

    it('should return 500 when an exception occurs', async () => {
      req.user = { id: 'user1' };
      req.body = { token: '123456' };
      jest.spyOn(UserMFA, 'findById').mockRejectedValue(new Error('Disable Error'));

      await disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to disable 2FA',
        details: 'Disable Error'
      });
    });
  });
});