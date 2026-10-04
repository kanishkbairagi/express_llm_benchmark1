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

    // Default mocks
    OAuthUser.findByProviderId = jest.fn().mockResolvedValue(null);
    OAuthUser.findByEmail = jest.fn().mockResolvedValue(null);
    OAuthUser.create = jest.fn().mockImplementation(async (data) => ({
      id: 'usr_12345',
      ...data,
      createdAt: new Date()
    }));
    OAuthUser.linkProvider = jest.fn().mockResolvedValue(true);

    OAuthService.exchangeGoogleCode = jest.fn().mockImplementation(async (code) => {
      if (code === 'invalid_code') throw new Error('Bad verification code');
      return {
        googleId: 'g_1029384756',
        email: 'alex@gmail.com',
        name: 'Alex Rivera',
        avatar: 'https://lh3.googleusercontent.com/a/mock'
      };
    });
    OAuthService.exchangeGithubCode = jest.fn().mockImplementation(async (code) => {
      if (code === 'invalid_code') throw new Error('Bad verification code');
      return {
        githubId: 'gh_99887766',
        email: 'alex.rivera@github.com',
        username: 'arivera',
        avatar: 'https://avatars.githubusercontent.com/u/99887766'
      };
    });
    OAuthService.generateJwt = jest.fn().mockImplementation(({ id }) => `mock_oauth_jwt_${id}`);
  });

  // ---------- Google Callback Tests ----------
  test('Google callback – missing code returns 400', async () => {
    const req = { query: {} };
    const res = mockRes();

    await handleGoogleCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authorization code is missing from callback'
    });
  });

  test('Google callback – invalid code returns 401', async () => {
    const req = { query: { code: 'invalid_code' } };
    const res = mockRes();

    await handleGoogleCallback(req, res);

    expect(OAuthService.exchangeGoogleCode).toHaveBeenCalledWith('invalid_code');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication failed: Invalid authorization code'
    });
  });

  test('Google callback – creates new user when none exists', async () => {
    const req = { query: { code: 'valid_code' } };
    const res = mockRes();

    await handleGoogleCallback(req, res);

    expect(OAuthUser.findByProviderId).toHaveBeenCalledWith('google', 'g_1029384756');
    expect(OAuthUser.findByEmail).toHaveBeenCalledWith('alex@gmail.com');
    expect(OAuthUser.create).toHaveBeenCalledWith({
      email: 'alex@gmail.com',
      name: 'Alex Rivera',
      avatar: 'https://lh3.googleusercontent.com/a/mock',
      providers: { google: 'g_1029384756' },
      isEmailVerified: true
    });
    expect(OAuthService.generateJwt).toHaveBeenCalledWith({
      id: 'usr_12345',
      email: 'alex@gmail.com'
    });

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
    expect(jsonArg.data.token).toBe('mock_oauth_jwt_usr_12345');
    expect(jsonArg.data.user.id).toBe('usr_12345');
    expect(jsonArg.data.user.email).toBe('alex@gmail.com');
  });

  test('Google callback – links provider when user exists by email', async () => {
    const existingUser = {
      id: 'usr_777',
      email: 'alex@gmail.com',
      name: 'Alex Rivera',
      avatar: 'https://lh3.googleusercontent.com/a/mock'
    };
    OAuthUser.findByProviderId.mockResolvedValue(null);
    OAuthUser.findByEmail.mockResolvedValue(existingUser);

    const req = { query: { code: 'valid_code' } };
    const res = mockRes();

    await handleGoogleCallback(req, res);

    expect(OAuthUser.linkProvider).toHaveBeenCalledWith('usr_777', 'google', 'g_1029384756');
    expect(OAuthUser.create).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.data.user.id).toBe('usr_777');
  });

  test('Google callback – uses existing user found by provider id', async () => {
    const providerUser = {
      id: 'usr_999',
      email: 'alex@gmail.com',
      name: 'Alex Rivera',
      avatar: 'https://lh3.googleusercontent.com/a/mock'
    };
    OAuthUser.findByProviderId.mockResolvedValue(providerUser);

    const req = { query: { code: 'valid_code' } };
    const res = mockRes();

    await handleGoogleCallback(req, res);

    expect(OAuthUser.findByEmail).not.toHaveBeenCalled();
    expect(OAuthUser.create).not.toHaveBeenCalled();
    expect(OAuthUser.linkProvider).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.data.user.id).toBe('usr_999');
  });

  // ---------- Github Callback Tests ----------
  test('Github callback – missing code returns 400', async () => {
    const req = { query: {} };
    const res = mockRes();

    await handleGithubCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authorization code is missing from callback'
    });
  });

  test('Github callback – invalid code returns 401', async () => {
    const req = { query: { code: 'invalid_code' } };
    const res = mockRes();

    await handleGithubCallback(req, res);

    expect(OAuthService.exchangeGithubCode).toHaveBeenCalledWith('invalid_code');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication failed: Invalid GitHub authorization code'
    });
  });

  test('Github callback – missing email returns 422', async () => {
    OAuthService.exchangeGithubCode.mockResolvedValue({
      githubId: 'gh_111',
      email: null,
      username: 'user123',
      avatar: 'avatar_url'
    });

    const req = { query: { code: 'valid_code' } };
    const res = mockRes();

    await handleGithubCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Unable to retrieve verified email from GitHub account'
    });
  });

  test('Github callback – creates new user when none exists', async () => {
    const req = { query: { code: 'valid_code' } };
    const res = mockRes();

    await handleGithubCallback(req, res);

    expect(OAuthUser.findByProviderId).toHaveBeenCalledWith('github', 'gh_99887766');
    expect(OAuthUser.findByEmail).toHaveBeenCalledWith('alex.rivera@github.com');
    expect(OAuthUser.create).toHaveBeenCalledWith({
      email: 'alex.rivera@github.com',
      name: 'arivera',
      avatar: 'https://avatars.githubusercontent.com/u/99887766',
      providers: { github: 'gh_99887766' },
      isEmailVerified: true
    });
    expect(OAuthService.generateJwt).toHaveBeenCalledWith({
      id: 'usr_12345',
      email: 'alex.rivera@github.com'
    });

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.data.user.id).toBe('usr_12345');
    expect(jsonArg.data.token).toBe('mock_oauth_jwt_usr_12345');
  });

  test('Github callback – links provider when user exists by email', async () => {
    const existingUser = {
      id: 'usr_555',
      email: 'alex.rivera@github.com',
      name: 'arivera',
      avatar: 'https://avatars.githubusercontent.com/u/99887766'
    };
    OAuthUser.findByProviderId.mockResolvedValue(null);
    OAuthUser.findByEmail.mockResolvedValue(existingUser);

    const req = { query: { code: 'valid_code' } };
    const res = mockRes();

    await handleGithubCallback(req, res);

    expect(OAuthUser.linkProvider).toHaveBeenCalledWith('usr_555', 'github', 'gh_99887766');
    expect(OAuthUser.create).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.data.user.id).toBe('usr_555');
  });

  test('Github callback – uses existing user found by provider id', async () => {
    const providerUser = {
      id: 'usr_666',
      email: 'alex.rivera@github.com',
      name: 'arivera',
      avatar: 'https://avatars.githubusercontent.com/u/99887766'
    };
    OAuthUser.findByProviderId.mockResolvedValue(providerUser);

    const req = { query: { code: 'valid_code' } };
    const res = mockRes();

    await handleGithubCallback(req, res);

    expect(OAuthUser.findByEmail).not.toHaveBeenCalled();
    expect(OAuthUser.create).not.toHaveBeenCalled();
    expect(OAuthUser.linkProvider).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.data.user.id).toBe('usr_666');
  });
});