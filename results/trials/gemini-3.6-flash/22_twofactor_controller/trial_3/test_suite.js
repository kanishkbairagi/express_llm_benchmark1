import { jest } from '@jest/globals';
import {
  setup2FA,
  verifyAndEnable2FA,
  disable2FA,
  UserMFA,
  TOTPService
} from '../dataset/22_twofactor_controller.js';

describe('22_twofactor_controller unit tests', () => {
  let mockRes;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('setup2FA', () => {
    it('should return 401 if no userId is provided in req.user or req.body', async () => {
      const req = { user: {}, body: {} };

      await setup2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 if MFA is already enabled for the user', async () => {
      const req = { user: { id: 'user-123', email: 'test@example.com' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'user-123', mfaEnabled: true });

      await setup2FA(req, mockRes);

      expect(UserMFA.findById).toHaveBeenCalledWith('user-123');
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Two-factor authentication is already active for this account'
      });
    });

    it('should initiate MFA setup successfully using req.user credentials', async () => {
      const req = { user: { id: 'user-123', email: 'test@example.com' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'user-123', mfaEnabled: false });
      jest.spyOn(UserMFA, 'savePendingSecret').mockResolvedValue(true);
      jest.spyOn(TOTPService, 'generateSecret').mockReturnValue({
        secret: 'MOCKSECRET',
        otpAuthUrl: 'otpauth://mock',
        qrCodeDataUrl: 'data:image/png;base64,mock'
      });

      await setup2FA(req, mockRes);

      expect(TOTPService.generateSecret).toHaveBeenCalledWith('test@example.com');
      expect(UserMFA.savePendingSecret).toHaveBeenCalledWith('user-123', 'MOCKSECRET');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'MFA setup initiated. Verify code to complete activation.',
        data: {
          secret: 'MOCKSECRET',
          otpAuthUrl: 'otpauth://mock',
          qrCodeDataUrl: 'data:image/png;base64,mock'
        }
      });
    });

    it('should fallback to req.body and default email if req.user is absent', async () => {
      const req = { body: { userId: 'body-user-123' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue(null);
      jest.spyOn(UserMFA, 'savePendingSecret').mockResolvedValue(true);
      const generateSecretSpy = jest.spyOn(TOTPService, 'generateSecret');

      await setup2FA(req, mockRes);

      expect(generateSecretSpy).toHaveBeenCalledWith('user@example.com');
      expect(UserMFA.savePendingSecret).toHaveBeenCalledWith('body-user-123', expect.any(String));
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 if an error occurs during setup', async () => {
      const req = { user: { id: 'user-123' } };
      jest.spyOn(UserMFA, 'findById').mockRejectedValue(new Error('Database error'));

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
    it('should return 401 if userId is missing', async () => {
      const req = { body: { token: '123456' } };

      await verifyAndEnable2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 if token is missing or not a string', async () => {
      const req = { user: { id: 'user-123' }, body: { token: 123456 } };

      await verifyAndEnable2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'A 6-digit TOTP verification code is required'
      });
    });

    it('should return 400 if token is not formatted as exactly 6 digits', async () => {
      const req = { user: { id: 'user-123' }, body: { token: '12345' } };

      await verifyAndEnable2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Verification code must be exactly 6 digits'
      });
    });

    it('should return 400 if user or pendingMfaSecret is not found', async () => {
      const req = { user: { id: 'user-123' }, body: { token: '123456' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'user-123' });

      await verifyAndEnable2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'No pending 2FA setup found. Initiate setup first.'
      });
    });

    it('should return 400 if TOTP verification fails', async () => {
      const req = { user: { id: 'user-123' }, body: { token: '123456' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'user-123', pendingMfaSecret: 'PENDING_SECRET' });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(false);

      await verifyAndEnable2FA(req, mockRes);

      expect(TOTPService.verifyToken).toHaveBeenCalledWith('PENDING_SECRET', '123456');
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid or expired 2FA verification code'
      });
    });

    it('should successfully verify and enable 2FA', async () => {
      const req = { user: { id: 'user-123' }, body: { token: ' 123456 ' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'user-123', pendingMfaSecret: 'PENDING_SECRET' });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(true);
      jest.spyOn(TOTPService, 'generateBackupCodes').mockReturnValue(['BACKUP-1', 'BACKUP-2']);
      jest.spyOn(UserMFA, 'enableMFA').mockResolvedValue(true);

      await verifyAndEnable2FA(req, mockRes);

      expect(TOTPService.verifyToken).toHaveBeenCalledWith('PENDING_SECRET', '123456');
      expect(UserMFA.enableMFA).toHaveBeenCalledWith('user-123', 'PENDING_SECRET', ['BACKUP-1', 'BACKUP-2']);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Two-factor authentication successfully enabled',
        data: {
          mfaEnabled: true,
          backupCodes: ['BACKUP-1', 'BACKUP-2']
        }
      });
    });

    it('should return 500 if an exception is thrown', async () => {
      const req = { user: { id: 'user-123' }, body: { token: '123456' } };
      jest.spyOn(UserMFA, 'findById').mockRejectedValue(new Error('Server error'));

      await verifyAndEnable2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to verify and activate 2FA',
        details: 'Server error'
      });
    });
  });

  describe('disable2FA', () => {
    it('should return 401 if userId is not provided', async () => {
      const req = { body: { token: '123456' } };

      await disable2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 if token is missing', async () => {
      const req = { user: { id: 'user-123' }, body: {} };

      await disable2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Verification code required to disable 2FA'
      });
    });

    it('should return 400 if user is not found or 2FA is not enabled', async () => {
      const req = { user: { id: 'user-123' }, body: { token: '123456' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'user-123', mfaEnabled: false });

      await disable2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: '2FA is not enabled on this account'
      });
    });

    it('should return 401 if token is invalid', async () => {
      const req = { user: { id: 'user-123' }, body: { token: '000000' } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'user-123', mfaEnabled: true, mfaSecret: 'SECRET' });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(false);

      await disable2FA(req, mockRes);

      expect(TOTPService.verifyToken).toHaveBeenCalledWith('SECRET', '000000');
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid 2FA code'
      });
    });

    it('should successfully disable 2FA when valid token is provided', async () => {
      const req = { user: { id: 'user-123' }, body: { token: 123456 } };
      jest.spyOn(UserMFA, 'findById').mockResolvedValue({ id: 'user-123', mfaEnabled: true, mfaSecret: 'SECRET' });
      jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(true);
      jest.spyOn(UserMFA, 'disableMFA').mockResolvedValue(true);

      await disable2FA(req, mockRes);

      expect(TOTPService.verifyToken).toHaveBeenCalledWith('SECRET', '123456');
      expect(UserMFA.disableMFA).toHaveBeenCalledWith('user-123');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Two-factor authentication has been disabled'
      });
    });

    it('should return 500 if an error occurs', async () => {
      const req = { user: { id: 'user-123' }, body: { token: '123456' } };
      jest.spyOn(UserMFA, 'findById').mockRejectedValue(new Error('Database error'));

      await disable2FA(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to disable 2FA',
        details: 'Database error'
      });
    });
  });
});