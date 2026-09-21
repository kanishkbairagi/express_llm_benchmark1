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

describe('handleGoogleCallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when code is missing', async () => {
    const req = { query: {} };
    const res = mockRes();

    await handleGoogleCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authorization code is missing from callback'
    });
  });

  test('returns 401 when OAuthService.exchangeGoogleCode throws', async () => {
    const req = { query: { code: 'invalid_code' } };
    const res = mockRes();

    jest.spyOn(OAuthService, 'exchangeGoogleCode').mockRejectedValue(new Error('Bad verification code'));

    await handleGoogleCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication failed: Invalid authorization code'
    });
  });

  test('returns 200 with existing provider user', async () => {
    const user = {
      id: 'usr_123',
      email: 'alex@gmail.com',
      name: 'Alex Rivera',
      avatar: 'https://lh3.googleusercontent.com/a/mock'
    };
    const req = { query: { code: 'valid_code' } };
    const res = mockRes();

    jest.spyOn(OAuthService, 'exchangeGoogleCode').mockResolvedValue({
      googleId: 'g_1029384756',
      email: 'alex@gmail.com',
      name: 'Alex Rivera',
      avatar: 'https://lh3.googleusercontent.com/a/mock'
    });
    jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(user);
    jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_oauth_jwt_usr_123');

    await handleGoogleCallback(req, res);

    expect(OAuthUser.findByProviderId).toHaveBeenCalledWith('google', 'g_1029384756');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Google authentication successful',
      data: {
        token: 'mock_oauth_jwt_usr_123',
        user: {
          id: 'usr_123',
          name: 'Alex Rivera',
          email: 'alex@gmail.com',
          avatar: 'https://lh3.googleusercontent.com/a/mock'
        }
      }
    });
  });

  test('links provider when email exists but provider does not', async () => {
    const existingUser = {
      id: 'usr_456',
      email: 'alex@gmail.com',
      name: 'Alex Rivera',
      avatar: 'https://lh3.googleusercontent.com/a/mock'
    };
    const req = { query: { code: 'valid_code' } };
    const res = mockRes();

    jest.spyOn(OAuthService, 'exchangeGoogleCode').mockResolvedValue({
      googleId: 'g_1029384756',
      email: 'alex@gmail.com',
      name: 'Alex Rivera',
      avatar: 'https://lh3.googleusercontent.com/a/mock'
    });
    jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
    jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(existingUser);
    const linkSpy = jest.spyOn(OAuthUser, 'linkProvider').mockResolvedValue(true);
    jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_oauth_jwt_usr_456');

    await handleGoogleCallback(req, res);

    expect(linkSpy).toHaveBeenCalledWith('usr_456', 'google', 'g_1029384756');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.user.id).toBe('usr_456');
  });

  test('creates new user when neither provider nor email exist', async () => {
    const req = { query: { code: 'valid_code' } };
    const res = mockRes();

    jest.spyOn(OAuthService, 'exchangeGoogleCode').mockResolvedValue({
      googleId: 'g_1029384756',
      email: 'newuser@gmail.com',
      name: 'New User',
      avatar: 'https://lh3.googleusercontent.com/a/mock'
    });
    jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
    jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(null);
    const createSpy = jest.spyOn(OAuthUser, 'create').mockImplementation(async (data) => ({
      id: 'usr_new',
      ...data
    }));
    jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_oauth_jwt_usr_new');

    await handleGoogleCallback(req, res);

    expect(createSpy).toHaveBeenCalledWith({
      email: 'newuser@gmail.com',
      name: 'New User',
      avatar: 'https://lh3.googleusercontent.com/a/mock',
      providers: { google: 'g_1029384756' },
      isEmailVerified: true
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.user.id).toBe('usr_new');
  });
});

describe('handleGithubCallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when code is missing', async () => {
    const req = { query: {} };
    const res = mockRes();

    await handleGithubCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authorization code is missing from callback'
    });
  });

  test('returns 401 when OAuthService.exchangeGithubCode throws', async () => {
    const req = { query: { code: 'invalid_code' } };
    const res = mockRes();

    jest.spyOn(OAuthService, 'exchangeGithubCode').mockRejectedValue(new Error('Bad verification code'));

    await handleGithubCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication failed: Invalid GitHub authorization code'
    });
  });

  test('returns 422 when email is missing from GitHub profile', async () => {
    const req = { query: { code: 'valid_code' } };
    const res = mockRes();

    jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue({
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

  test('returns 200 with existing provider user', async () => {
    const user = {
      id: 'usr_789',
      email: 'alex.rivera@github.com',
      name: 'arivera',
      avatar: 'https://avatars.githubusercontent.com/u/99887766'
    };
    const req = { query: { code: 'valid_code' } };
    const res = mockRes();

    jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue({
      githubId: 'gh_99887766',
      email: 'alex.rivera@github.com',
      username: 'arivera',
      avatar: 'https://avatars.githubusercontent.com/u/99887766'
    });
    jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(user);
    jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_oauth_jwt_usr_789');

    await handleGithubCallback(req, res);

    expect(OAuthUser.findByProviderId).toHaveBeenCalledWith('github', 'gh_99887766');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'GitHub authentication successful',
      data: {
        token: 'mock_oauth_jwt_usr_789',
        user: {
          id: 'usr_789',
          name: 'arivera',
          email: 'alex.rivera@github.com',
          avatar: 'https://avatars.githubusercontent.com/u/99887766'
        }
      }
    });
  });

  test('links provider when email exists but provider does not', async () => {
    const existingUser = {
      id: 'usr_321',
      email: 'alex.rivera@github.com',
      name: 'Existing',
      avatar: 'old_avatar'
    };
    const req = { query: { code: 'valid_code' } };
    const res = mockRes();

    jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue({
      githubId: 'gh_99887766',
      email: 'alex.rivera@github.com',
      username: 'arivera',
      avatar: 'https://avatars.githubusercontent.com/u/99887766'
    });
    jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
    jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(existingUser);
    const linkSpy = jest.spyOn(OAuthUser, 'linkProvider').mockResolvedValue(true);
    jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_oauth_jwt_usr_321');

    await handleGithubCallback(req, res);

    expect(linkSpy).toHaveBeenCalledWith('usr_321', 'github', 'gh_99887766');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.user.id).toBe('usr_321');
  });

  test('creates new user when neither provider nor email exist', async () => {
    const req = { query: { code: 'valid_code' } };
    const res = mockRes();

    jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue({
      githubId: 'gh_99887766',
      email: 'newuser@github.com',
      username: 'newuser',
      avatar: 'https://avatars.githubusercontent.com/u/99999999'
    });
    jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
    jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(null);
    const createSpy = jest.spyOn(OAuthUser, 'create').mockImplementation(async (data) => ({
      id: 'usr_new_github',
      ...data
    }));
    jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_oauth_jwt_usr_new_github');

    await handleGithubCallback(req, res);

    expect(createSpy).toHaveBeenCalledWith({
      email: 'newuser@github.com',
      name: 'newuser',
      avatar: 'https://avatars.githubusercontent.com/u/99999999',
      providers: { github: 'gh_99887766' },
      isEmailVerified: true
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data.user.id).toBe('usr_new_github');
  });
});