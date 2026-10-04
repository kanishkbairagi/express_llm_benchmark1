import { jest } from '@jest/globals';
import {
  handleGoogleCallback,
  handleGithubCallback,
  OAuthUser,
  OAuthService
} from '../dataset/11_oauth_controller.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('OAuth Controllers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations
    OAuthService.exchangeGoogleCode = jest.fn().mockResolvedValue({
      googleId: 'g_1029384756',
      email: 'alex@gmail.com',
      name: 'Alex Rivera',
      avatar: 'https://lh3.googleusercontent.com/a/mock'
    });
    OAuthService.exchangeGithubCode = jest.fn().mockResolvedValue({
      githubId: 'gh_99887766',
      email: 'alex.rivera@github.com',
      username: 'arivera',
      avatar: 'https://avatars.githubusercontent.com/u/99887766'
    });
    OAuthService.generateJwt = jest.fn().mockImplementation(({ id }) => `jwt_${id}`);

    OAuthUser.findByProviderId = jest.fn().mockResolvedValue(null);
    OAuthUser.findByEmail = jest.fn().mockResolvedValue(null);
    OAuthUser.create = jest.fn().mockImplementation(async (data) => ({
      id: `usr_${Date.now()}`,
      ...data,
      createdAt: new Date()
    }));
    OAuthUser.linkProvider = jest.fn().mockResolvedValue(true);
  });

  // ---------- Google ----------

  test('Google callback – missing code', async () => {
    const req = { query: {} };
    const res = mockRes();

    await handleGoogleCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authorization code is missing from callback'
    });
  });

  test('Google callback – invalid code', async () => {
    const req = { query: { code: 'invalid_code' } };
    const res = mockRes();

    OAuthService.exchangeGoogleCode.mockImplementation(() => {
      throw new Error('Bad verification code');
    });

    await handleGoogleCallback(req, res);

    expect(OAuthService.exchangeGoogleCode).toHaveBeenCalledWith('invalid_code');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication failed: Invalid authorization code'
    });
  });

  test('Google callback – existing provider user', async () => {
    const existingUser = {
      id: 'usr_123',
      email: 'alex@gmail.com',
      name: 'Alex Rivera',
      avatar: 'https://lh3.googleusercontent.com/a/mock'
    };
    OAuthUser.findByProviderId.mockResolvedValue(existingUser);
    const req = { query: { code: 'valid_code' } };
    const res = mockRes();

    await handleGoogleCallback(req, res);

    expect(OAuthUser.findByProviderId).toHaveBeenCalledWith('google', 'g_1029384756');
    expect(OAuthUser.findByEmail).not.toHaveBeenCalled();
    expect(OAuthUser.create).not.toHaveBeenCalled();
    expect(OAuthService.generateJwt).toHaveBeenCalledWith({
      id: existingUser.id,
      email: existingUser.email
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Google authentication successful',
      data: {
        token: `jwt_${existingUser.id}`,
        user: {
          id: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
          avatar: existingUser.avatar
        }
      }
    });
  });

  test('Google callback – existing email user, link provider', async () => {
    const emailUser = {
      id: 'usr_456',
      email: 'alex@gmail.com',
      name: 'Alex Rivera',
      avatar: 'https://lh3.googleusercontent.com/a/mock'
    };
    OAuthUser.findByProviderId.mockResolvedValue(null);
    OAuthUser.findByEmail.mockResolvedValue(emailUser);
    const req = { query: { code: 'valid_code' } };
    const res = mockRes();

    await handleGoogleCallback(req, res);

    expect(OAuthUser.findByProviderId).toHaveBeenCalledWith('google', 'g_1029384756');
    expect(OAuthUser.findByEmail).toHaveBeenCalledWith('alex@gmail.com');
    expect(OAuthUser.linkProvider).toHaveBeenCalledWith(emailUser.id, 'google', 'g_1029384756');
    expect(OAuthUser.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.user.id).toBe(emailUser.id);
  });

  test('Google callback – new user creation', async () => {
    OAuthUser.findByProviderId.mockResolvedValue(null);
    OAuthUser.findByEmail.mockResolvedValue(null);
    const req = { query: { code: 'valid_code' } };
    const res = mockRes();

    await handleGoogleCallback(req, res);

    expect(OAuthUser.create).toHaveBeenCalledWith({
      email: 'alex@gmail.com',
      name: 'Alex Rivera',
      avatar: 'https://lh3.googleusercontent.com/a/mock',
      providers: { google: 'g_1029384756' },
      isEmailVerified: true
    });
    const createdUser = await OAuthUser.create.mock.results[0].value;
    expect(OAuthService.generateJwt).toHaveBeenCalledWith({
      id: createdUser.id,
      email: createdUser.email
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.user.id).toBe(createdUser.id);
  });

  // ---------- Github ----------

  test('Github callback – missing code', async () => {
    const req = { query: {} };
    const res = mockRes();

    await handleGithubCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authorization code is missing from callback'
    });
  });

  test('Github callback – invalid code', async () => {
    const req = { query: { code: 'invalid_code' } };
    const res = mockRes();

    OAuthService.exchangeGithubCode.mockImplementation(() => {
      throw new Error('Bad verification code');
    });

    await handleGithubCallback(req, res);

    expect(OAuthService.exchangeGithubCode).toHaveBeenCalledWith('invalid_code');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication failed: Invalid GitHub authorization code'
    });
  });

  test('Github callback – profile without email', async () => {
    const req = { query: { code: 'valid_code' } };
    const res = mockRes();

    OAuthService.exchangeGithubCode.mockResolvedValue({
      githubId: 'gh_99887766',
      email: null,
      username: 'arivera',
      avatar: 'https://avatars.githubusercontent.com/u/99887766'
    });

    await handleGithubCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Unable to retrieve verified email from GitHub account'
    });
  });

  test('Github callback – existing provider user', async () => {
    const existingUser = {
      id: 'usr_789',
      email: 'alex.rivera@github.com',
      name: 'arivera',
      avatar: 'https://avatars.githubusercontent.com/u/99887766'
    };
    OAuthUser.findByProviderId.mockResolvedValue(existingUser);
    const req = { query: { code: 'valid_code' } };
    const res = mockRes();

    await handleGithubCallback(req, res);

    expect(OAuthUser.findByProviderId).toHaveBeenCalledWith('github', 'gh_99887766');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.user.id).toBe(existingUser.id);
  });

  test('Github callback – existing email user, link provider', async () => {
    const emailUser = {
      id: 'usr_321',
      email: 'alex.rivera@github.com',
      name: 'arivera',
      avatar: 'https://avatars.githubusercontent.com/u/99887766'
    };
    OAuthUser.findByProviderId.mockResolvedValue(null);
    OAuthUser.findByEmail.mockResolvedValue(emailUser);
    const req = { query: { code: 'valid_code' } };
    const res = mockRes();

    await handleGithubCallback(req, res);

    expect(OAuthUser.linkProvider).toHaveBeenCalledWith(emailUser.id, 'github', 'gh_99887766');
    expect(OAuthUser.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.user.id).toBe(emailUser.id);
  });

  test('Github callback – new user creation', async () => {
    OAuthUser.findByProviderId.mockResolvedValue(null);
    OAuthUser.findByEmail.mockResolvedValue(null);
    const req = { query: { code: 'valid_code' } };
    const res = mockRes();

    await handleGithubCallback(req, res);

    expect(OAuthUser.create).toHaveBeenCalledWith({
      email: 'alex.rivera@github.com',
      name: 'arivera',
      avatar: 'https://avatars.githubusercontent.com/u/99887766',
      providers: { github: 'gh_99887766' },
      isEmailVerified: true
    });
    const createdUser = await OAuthUser.create.mock.results[0].value;
    expect(OAuthService.generateJwt).toHaveBeenCalledWith({
      id: createdUser.id,
      email: createdUser.email
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.user.id).toBe(createdUser.id);
  });
});