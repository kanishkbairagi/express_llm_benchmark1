import { jest } from '@jest/globals';
import * as controller from '../dataset/22_twofactor_controller.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('setup2FA', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mocks
    controller.UserMFA.findById = jest.fn().mockResolvedValue(null);
    controller.UserMFA.savePendingSecret = jest.fn().mockResolvedValue(true);
    controller.TOTPService.generateSecret = jest.fn().mockReturnValue({
      secret: 'TESTSECRET',
      otpAuthUrl: 'otpauth://totp/TestApp:user@example.com?secret=TESTSECRET&issuer=TestApp',
      qrCodeDataUrl: 'data:image/png;base64,FAKE'
    });
  });

  test('should initiate MFA setup when user is unauthenticated', async () => {
    const req = { user: { id: 'user1', email: 'alice@example.com' } };
    const res = mockRes();

    await controller.setup2FA(req, res);

    expect(controller.UserMFA.findById).toHaveBeenCalledWith('user1');
    expect(controller.TOTPService.generateSecret).toHaveBeenCalledWith('alice@example.com');
    expect(controller.UserMFA.savePendingSecret).toHaveBeenCalledWith('user1', 'TESTSECRET');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'MFA setup initiated. Verify code to complete activation.',
      data: {
        secret: 'TESTSECRET',
        otpAuthUrl: 'otpauth://totp/TestApp:user@example.com?secret=TESTSECRET&issuer=TestApp',
        qrCodeDataUrl: 'data:image/png;base64,FAKE'
      }
    });
  });

  test('should return 401 when userId is missing', async () => {
    const req = { body: {} };
    const res = mockRes();

    await controller.setup2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('should return 400 when MFA already enabled', async () => {
    const req = { user: { id: 'user2', email: 'bob@example.com' } };
    const res = mockRes();

    controller.UserMFA.findById.mockResolvedValue({ mfaEnabled: true });

    await controller.setup2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Two-factor authentication is already active for this account'
    });
  });
});

describe('verifyAndEnable2FA', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    controller.UserMFA.findById = jest.fn();
    controller.UserMFA.enableMFA = jest.fn().mockResolvedValue(true);
    controller.TOTPService.verifyToken = jest.fn();
    controller.TOTPService.generateBackupCodes = jest.fn().mockReturnValue(['CODE1', 'CODE2']);
  });

  test('should enable MFA with valid token and pending secret', async () => {
    const req = {
      user: { id: 'u1' },
      body: { token: '123456' }
    };
    const res = mockRes();

    controller.UserMFA.findById.mockResolvedValue({ pendingMfaSecret: 'SECRET123' });
    controller.TOTPService.verifyToken.mockReturnValue(true);

    await controller.verifyAndEnable2FA(req, res);

    expect(controller.UserMFA.findById).toHaveBeenCalledWith('u1');
    expect(controller.TOTPService.verifyToken).toHaveBeenCalledWith('SECRET123', '123456');
    expect(controller.UserMFA.enableMFA).toHaveBeenCalledWith('u1', 'SECRET123', ['CODE1', 'CODE2']);
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

  test('should return 401 when userId missing', async () => {
    const req = { body: { token: '123456' } };
    const res = mockRes();

    await controller.verifyAndEnable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('should return 400 when token missing', async () => {
    const req = { user: { id: 'u2' }, body: {} };
    const res = mockRes();

    await controller.verifyAndEnable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'A 6-digit TOTP verification code is required'
    });
  });

  test('should return 400 for malformed token', async () => {
    const req = { user: { id: 'u3' }, body: { token: '12ab56' } };
    const res = mockRes();

    await controller.verifyAndEnable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Verification code must be exactly 6 digits'
    });
  });

  test('should return 400 when no pending secret', async () => {
    const req = { user: { id: 'u4' }, body: { token: '123456' } };
    const res = mockRes();

    controller.UserMFA.findById.mockResolvedValue({}); // no pendingMfaSecret

    await controller.verifyAndEnable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'No pending 2FA setup found. Initiate setup first.'
    });
  });

  test('should return 400 when token verification fails', async () => {
    const req = { user: { id: 'u5' }, body: { token: '654321' } };
    const res = mockRes();

    controller.UserMFA.findById.mockResolvedValue({ pendingMfaSecret: 'SECRET' });
    controller.TOTPService.verifyToken.mockReturnValue(false);

    await controller.verifyAndEnable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid or expired 2FA verification code'
    });
  });
});

describe('disable2FA', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    controller.UserMFA.findById = jest.fn();
    controller.UserMFA.disableMFA = jest.fn().mockResolvedValue(true);
    controller.TOTPService.verifyToken = jest.fn();
  });

  test('should disable MFA with correct token', async () => {
    const req = { user: { id: 'uid' }, body: { token: '123456' } };
    const res = mockRes();

    controller.UserMFA.findById.mockResolvedValue({
      mfaEnabled: true,
      mfaSecret: 'SECRETXYZ'
    });
    controller.TOTPService.verifyToken.mockReturnValue(true);

    await controller.disable2FA(req, res);

    expect(controller.UserMFA.findById).toHaveBeenCalledWith('uid');
    expect(controller.TOTPService.verifyToken).toHaveBeenCalledWith('SECRETXYZ', '123456');
    expect(controller.UserMFA.disableMFA).toHaveBeenCalledWith('uid');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Two-factor authentication has been disabled'
    });
  });

  test('should return 401 when userId missing', async () => {
    const req = { body: { token: '123456' } };
    const res = mockRes();

    await controller.disable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('should return 400 when token missing', async () => {
    const req = { user: { id: 'uid' }, body: {} };
    const res = mockRes();

    await controller.disable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Verification code required to disable 2FA'
    });
  });

  test('should return 400 when 2FA not enabled on account', async () => {
    const req = { user: { id: 'uid' }, body: { token: '123456' } };
    const res = mockRes();

    controller.UserMFA.findById.mockResolvedValue({ mfaEnabled: false });

    await controller.disable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: '2FA is not enabled on this account'
    });
  });

  test('should return 401 when verification token invalid', async () => {
    const req = { user: { id: 'uid' }, body: { token: '999999' } };
    const res = mockRes();

    controller.UserMFA.findById.mockResolvedValue({
      mfaEnabled: true,
      mfaSecret: 'SECRET123'
    });
    controller.TOTPService.verifyToken.mockReturnValue(false);

    await controller.disable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid 2FA code'
    });
  });
});