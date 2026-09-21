import { jest } from '@jest/globals';
import {
  setup2FA,
  verifyAndEnable2FA,
  disable2FA,
  UserMFA,
  TOTPService
} from '../dataset/22_twofactor_controller.js';

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('setup2FA', () => {
  test('should initiate setup and return secret data', async () => {
    const req = { user: { id: 'u1', email: 'alice@example.com' } };
    const res = mockResponse();

    jest.spyOn(UserMFA, 'findById').mockResolvedValue(null);
    jest.spyOn(UserMFA, 'savePendingSecret').mockResolvedValue(true);
    jest.spyOn(TOTPService, 'generateSecret').mockReturnValue({
      secret: 'MYSECRET',
      otpAuthUrl: 'otpauth://totp/App:alice@example.com',
      qrCodeDataUrl: 'data:image/png;base64,xyz'
    });

    await setup2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          secret: 'MYSECRET',
          otpAuthUrl: 'otpauth://totp/App:alice@example.com',
          qrCodeDataUrl: 'data:image/png;base64,xyz'
        })
      })
    );
  });

  test('should return 401 when userId is missing', async () => {
    const req = { body: {} };
    const res = mockResponse();

    await setup2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Authentication required' })
    );
  });

  test('should return 400 when MFA already enabled', async () => {
    const req = { user: { id: 'u2', email: 'bob@example.com' } };
    const res = mockResponse();

    jest.spyOn(UserMFA, 'findById').mockResolvedValue({ mfaEnabled: true });

    await setup2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('already active') })
    );
  });
});

describe('verifyAndEnable2FA', () => {
  const baseUser = {
    pendingMfaSecret: 'PENDINGSECRET'
  };

  test('should enable MFA and return backup codes on valid token', async () => {
    const req = { user: { id: 'u3' }, body: { token: '123456' } };
    const res = mockResponse();

    jest.spyOn(UserMFA, 'findById').mockResolvedValue(baseUser);
    jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(true);
    jest.spyOn(TOTPService, 'generateBackupCodes').mockReturnValue(['CODE1', 'CODE2']);
    jest.spyOn(UserMFA, 'enableMFA').mockResolvedValue(true);

    await verifyAndEnable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          mfaEnabled: true,
          backupCodes: ['CODE1', 'CODE2']
        })
      })
    );
  });

  test('should return 401 when userId is missing', async () => {
    const req = { body: { token: '123456' } };
    const res = mockResponse();

    await verifyAndEnable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Authentication required' })
    );
  });

  test('should return 400 when token is missing', async () => {
    const req = { user: { id: 'u4' }, body: {} };
    const res = mockResponse();

    await verifyAndEnable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('6-digit') })
    );
  });

  test('should return 400 for invalid token format', async () => {
    const req = { user: { id: 'u5' }, body: { token: '12ab56' } };
    const res = mockResponse();

    await verifyAndEnable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('exactly 6 digits') })
    );
  });

  test('should return 400 when no pending secret is found', async () => {
    const req = { user: { id: 'u6' }, body: { token: '123456' } };
    const res = mockResponse();

    jest.spyOn(UserMFA, 'findById').mockResolvedValue({}); // no pendingMfaSecret

    await verifyAndEnable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('No pending') })
    );
  });

  test('should return 400 when token verification fails', async () => {
    const req = { user: { id: 'u7' }, body: { token: '123456' } };
    const res = mockResponse();

    jest.spyOn(UserMFA, 'findById').mockResolvedValue(baseUser);
    jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(false);

    await verifyAndEnable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('Invalid') })
    );
  });
});

describe('disable2FA', () => {
  const enabledUser = {
    mfaEnabled: true,
    mfaSecret: 'ENABLEDSECRET'
  };

  test('should disable MFA on valid token', async () => {
    const req = { user: { id: 'u8' }, body: { token: '123456' } };
    const res = mockResponse();

    jest.spyOn(UserMFA, 'findById').mockResolvedValue(enabledUser);
    jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(true);
    jest.spyOn(UserMFA, 'disableMFA').mockResolvedValue(true);

    await disable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, message: expect.stringContaining('disabled') })
    );
  });

  test('should return 401 when userId is missing', async () => {
    const req = { body: { token: '123456' } };
    const res = mockResponse();

    await disable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Authentication required' })
    );
  });

  test('should return 400 when token is missing', async () => {
    const req = { user: { id: 'u9' }, body: {} };
    const res = mockResponse();

    await disable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('Verification code required') })
    );
  });

  test('should return 400 when 2FA not enabled', async () => {
    const req = { user: { id: 'u10' }, body: { token: '123456' } };
    const res = mockResponse();

    jest.spyOn(UserMFA, 'findById').mockResolvedValue({ mfaEnabled: false });

    await disable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('not enabled') })
    );
  });

  test('should return 401 when token verification fails', async () => {
    const req = { user: { id: 'u11' }, body: { token: '000000' } };
    const res = mockResponse();

    jest.spyOn(UserMFA, 'findById').mockResolvedValue(enabledUser);
    jest.spyOn(TOTPService, 'verifyToken').mockReturnValue(false);

    await disable2FA(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('Invalid') })
    );
  });
});