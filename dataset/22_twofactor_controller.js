// 22_twofactor_controller.js - TOTP MFA Setup & Verification

// Mock Database & TOTP Services
export const UserMFA = {
  findById: async (id) => null,
  savePendingSecret: async (id, secret) => true,
  enableMFA: async (id, secret, backupCodes) => true,
  disableMFA: async (id) => true
};

export const TOTPService = {
  generateSecret: (email) => ({
    secret: 'JBSWY3DPEHPK3PXP',
    otpAuthUrl: `otpauth://totp/BenchmarkApp:${email}?secret=JBSWY3DPEHPK3PXP&issuer=BenchmarkApp`,
    qrCodeDataUrl: 'data:image/png;base64,mockQrCodeDataUrl'
  }),
  verifyToken: (secret, token) => token === '123456',
  generateBackupCodes: (count = 8) =>
    Array.from({ length: count }, (_, i) => `BACKUP-${i + 1}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`)
};

export const setup2FA = async (req, res) => {
  try {
    const userId = req.user?.id || req.body?.userId;
    const userEmail = req.user?.email || req.body?.email || 'user@example.com';

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const user = await UserMFA.findById(userId);
    if (user && user.mfaEnabled) {
      return res.status(400).json({
        success: false,
        error: 'Two-factor authentication is already active for this account'
      });
    }

    const { secret, otpAuthUrl, qrCodeDataUrl } = TOTPService.generateSecret(userEmail);
    await UserMFA.savePendingSecret(userId, secret);

    return res.status(200).json({
      success: true,
      message: 'MFA setup initiated. Verify code to complete activation.',
      data: {
        secret,
        otpAuthUrl,
        qrCodeDataUrl
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to initiate 2FA setup',
      details: error.message
    });
  }
};

export const verifyAndEnable2FA = async (req, res) => {
  try {
    const userId = req.user?.id || req.body?.userId;
    const { token } = req.body || {};

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'A 6-digit TOTP verification code is required'
      });
    }

    const cleanToken = token.trim();
    if (!/^\d{6}$/.test(cleanToken)) {
      return res.status(400).json({
        success: false,
        error: 'Verification code must be exactly 6 digits'
      });
    }

    const user = await UserMFA.findById(userId);
    if (!user || !user.pendingMfaSecret) {
      return res.status(400).json({
        success: false,
        error: 'No pending 2FA setup found. Initiate setup first.'
      });
    }

    const isValid = TOTPService.verifyToken(user.pendingMfaSecret, cleanToken);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired 2FA verification code'
      });
    }

    const backupCodes = TOTPService.generateBackupCodes();
    await UserMFA.enableMFA(userId, user.pendingMfaSecret, backupCodes);

    return res.status(200).json({
      success: true,
      message: 'Two-factor authentication successfully enabled',
      data: {
        mfaEnabled: true,
        backupCodes
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to verify and activate 2FA',
      details: error.message
    });
  }
};

export const disable2FA = async (req, res) => {
  try {
    const userId = req.user?.id || req.body?.userId;
    const { token } = req.body || {};

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!token) {
      return res.status(400).json({ success: false, error: 'Verification code required to disable 2FA' });
    }

    const user = await UserMFA.findById(userId);
    if (!user || !user.mfaEnabled) {
      return res.status(400).json({ success: false, error: '2FA is not enabled on this account' });
    }

    const isValid = TOTPService.verifyToken(user.mfaSecret, String(token).trim());
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid 2FA code' });
    }

    await UserMFA.disableMFA(userId);

    return res.status(200).json({
      success: true,
      message: 'Two-factor authentication has been disabled'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to disable 2FA',
      details: error.message
    });
  }
};
