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
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  describe('TOTPService standalone methods', () => {
    test('generateSecret generates correct secret structure', () => {
      const result = TOTPService.generateSecret('test@domain.com');
      expect(result).toHaveProperty('secret', 'JBSWY3DPEHPK3PXP');
      expect(result.otpAuthUrl).toContain('test@domain.com');
      expect(result.qrCodeDataUrl).toContain('data:image/png;base64');
    });

    test('verifyToken verifies token correctly', () => {
      expect(TOTPService.verifyToken('secret', '123456')).toBe(true);
      expect(TOTPService.verifyToken('secret', '000000')).toBe(false);
    });

    test('generateBackupCodes generates expected number of codes', () => {
      const defaultCodes = TOTPService.generateBackupCodes();
      expect(defaultCodes).toHaveLength(8);
      expect(defaultCodes[0]).toMatch(/^BACKUP-1-/);

      const customCountCodes = TOTPService.generateBackupCodes(4);
      expect(customCountCodes).toHaveLength(4);
    });
  });

  describe('UserMFA default implementations', () => {
    test('default DB methods perform basic operations', async () => {
      await expect(UserMFA.findById('1')).resolves.toBeNull();
      await expect(UserMFA.savePendingSecret('1', 'secret')).resolves.toBe(true);
      await expect(UserMFA.enableMFA('1', 'secret', [])).resolves.toBe(true);
      await expect(UserMFA.disableMFA('1')).resolves.toBe(true);
    });
  });

  describe('setup2FA', () => {
    test('should return 401 if no userId is provided in req.user or req.body', async () => {
      req = { body: {} };
      await setup2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 if user already has MFA enabled', async () => {
      req = { user: { id: 'user1', email: 'user@test.com' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'user1', mfaEnabled: true });

      await setup2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Two-factor authentication is already active for this account'
      });
    });

    test('should initiate setup successfully using req.user credentials', async () => {
      req = { user: { id: 'user1', email: 'user@test.com' } };
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
          otpAuthUrl: expect.stringContaining('user@test.com'),
          qrCodeDataUrl: 'data:image/png;base64,mockQrCodeDataUrl'
        }
      });
    });

    test('should fallback to req.body user credentials or default email if user object missing', async () => {
      req = { body: { userId: 'user2' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue(null);
      jest.spyOn(UserMFA, 'savePendingSecret').mockResolvedValue(true);

      await setup2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'MFA setup initiated. Verify code to complete activation.',
        data: expect.objectContaining({
          otpAuthUrl: expect.stringContaining('user@example.com')
        })
      });
    });

    test('should return 500 when an error occurs during setup', async () => {
      req = { user: { id: 'user1' } };
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
    test('should return 401 if userId is missing', async () => {
      req = { body: { token: '123456' } };
      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Authentication required' });
    });

    test('should return 400 if token is missing or not a string', async () => {
      req = { user: { id: 'user1' }, body: { token: 123456 } };
      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'A 6-digit TOTP verification code is required'
      });
    });

    test('should return 400 if token format is not 6 digits', async () => {
      req = { user: { id: 'user1' }, body: { token: '12345' } };
      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Verification code must be exactly 6 digits'
      });

      req.body.token = '12345a';
      await verifyAndEnable2FA(req, res);
      expect(res.status).toHaveBeenLastCalledWith(400);
    });

    test('should return 400 if user or pendingMfaSecret is not found', async () => {
      req = { user: { id: 'user1' }, body: { token: '123456' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue(null);

      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'No pending 2FA setup found. Initiate setup first.'
      });
    });

    test('should return 400 if TOTP code is invalid', async () => {
      req = { user: { id: 'user1' }, body: { token: '000000' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ pendingMfaSecret: 'JBSWY3DPEHPK3PXP' });

      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid or expired 2FA verification code'
      });
    });

    test('should enable 2FA successfully when valid code is provided', async () => {
      req = { user: { id: 'user1' }, body: { token: ' 123456 ' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ pendingMfaSecret: 'JBSWY3DPEHPK3PXP' });
      jest.spyOn(UserMFA, 'enableMFA').mockResolvedValue(true);

      await verifyAndEnable2FA(req, res);

      expect(UserMFA.enableMFA).toHaveBeenCalledWith('user1', 'JBSWY3DPEHPK3PXP', expect.any(Array));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Two-factor authentication successfully enabled',
        data: {
          mfaEnabled: true,
          backupCodes: expect.any(Array)
        }
      });
    });

    test('should return 500 when error occurs during verification', async () => {
      req = { user: { id: 'user1' }, body: { token: '123456' } };
      jest.spyOn(UserMFA, 'findById').mockRejectedValue(new Error('Verification process failure'));

      await verifyAndEnable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to verify and activate 2FA',
        details: 'Verification process failure'
      });
    });
  });

  describe('disable2FA', () => {
    test('should return 401 if userId is missing', async () => {
      req = { body: { token: '123456' } };
      await disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Authentication required' });
    });

    test('should return 400 if token is missing', async () => {
      req = { user: { id: 'user1' }, body: {} };
      await disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Verification code required to disable 2FA' });
    });

    test('should return 400 if user does not exist or mfaEnabled is false', async () => {
      req = { user: { id: 'user1' }, body: { token: '123456' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ mfaEnabled: false });

      await disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: '2FA is not enabled on this account' });
    });

    test('should return 401 if invalid code provided', async () => {
      req = { user: { id: 'user1' }, body: { token: '000000' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP' });

      await disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Invalid 2FA code' });
    });

    test('should disable 2FA successfully when valid code is provided', async () => {
      req = { user: { id: 'user1' }, body: { token: '123456' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP' });
      jest.spyOn(UserMFA, 'disableMFA').mockResolvedValue(true);

      await disable2FA(req, res);

      expect(UserMFA.disableMFA).toHaveBeenCalledWith('user1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Two-factor authentication has been disabled'
      });
    });

    test('should return 500 on internal exception', async () => {
      req = { user: { id: 'user1' }, body: { token: '123456' } };
      jest.spyOn(UserMFA, 'findById').mockRejectedValue(new Error('Disable failed'));

      await disable2FA(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to disable 2FA',
        details: 'Disable failed'
      });
    });
  });
});