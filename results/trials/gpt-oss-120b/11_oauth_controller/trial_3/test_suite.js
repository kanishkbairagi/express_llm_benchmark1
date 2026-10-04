import { jest } from '@jest/globals';
import {
  handleGoogleCallback,
  handleGithubCallback,
  OAuthUser,
  OAuthService
} from '../dataset/11_oauth_controller.js';

const createRes = () => {
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
    const res = createRes();

    await handleGoogleCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authorization code is missing from callback'
    });
  });

  test('returns 401 when OAuthService.exchangeGoogleCode throws', async () => {
    const req = { query: { code: 'invalid_code' } };
    const res = createRes();

    await handleGoogleCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication failed: Invalid authorization code'
    });
  });

  test('creates a new user when none exists', async () => {
    const req = { query: { code: 'valid_code' } };
    const res = createRes();

    const mockProfile = {
      googleId: 'g_1029384756',
      email: 'alex@gmail.com',
      name: 'Alex Rivera',
      avatar: 'https://lh3.googleusercontent.com/a/mock'
    };
    jest.spyOn(OAuthService, 'exchangeGoogleCode').mockResolvedValue(mockProfile);
    jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
    jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(null);
    const createSpy = jest.spyOn(OAuthUser, 'create').mockImplementation(async (data) => ({
      id: 'usr_12345',
      ...data,
      createdAt: new Date()
    }));
    const tokenSpy = jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_oauth_jwt_usr_12345');

    await handleGoogleCallback(req, res);

    expect(createSpy).toHaveBeenCalledWith({
      email: mockProfile.email,
      name: mockProfile.name,
      avatar: mockProfile.avatar,
      providers: { google: mockProfile.googleId },
      isEmailVerified: true
    });
    expect(tokenSpy).toHaveBeenCalledWith({ id: 'usr_12345', email: mockProfile.email });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Google authentication successful',
      data: {
        token: 'mock_oauth_jwt_usr_12345',
        user: {
          id: 'usr_12345',
          name: mockProfile.name,
          email: mockProfile.email,
          avatar: mockProfile.avatar
        }
      }
    });
  });

  test('links provider to existing email user when provider not linked', async () => {
    const req = { query: { code: 'valid_code' } };
    const res = createRes();

    const mockProfile = {
      googleId: 'g_1029384756',
      email: 'alex@gmail.com',
      name: 'Alex Rivera',
      avatar: 'https://lh3.googleusercontent.com/a/mock'
    };
    jest.spyOn(OAuthService, 'exchangeGoogleCode').mockResolvedValue(mockProfile);
    jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
    const existingUser = {
      id: 'usr_999',
      email: mockProfile.email,
      name: 'Alex R.',
      avatar: 'old_avatar',
      providers: {}
    };
    jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(existingUser);
    const linkSpy = jest.spyOn(OAuthUser, 'linkProvider').mockResolvedValue(true);
    const tokenSpy = jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_oauth_jwt_usr_999');

    await handleGoogleCallback(req, res);

    expect(linkSpy).toHaveBeenCalledWith('usr_999', 'google', mockProfile.googleId);
    expect(tokenSpy).toHaveBeenCalledWith({ id: 'usr_999', email: mockProfile.email });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Google authentication successful',
      data: {
        token: 'mock_oauth_jwt_usr_999',
        user: {
          id: 'usr_999',
          name: existingUser.name,
          email: existingUser.email,
          avatar: existingUser.avatar
        }
      }
    });
  });

  test('returns existing provider user without creating/linking', async () => {
    const req = { query: { code: 'valid_code' } };
    const res = createRes();

    const mockProfile = {
      googleId: 'g_1029384756',
      email: 'alex@gmail.com',
      name: 'Alex Rivera',
      avatar: 'https://lh3.googleusercontent.com/a/mock'
    };
    const existingUser = {
      id: 'usr_777',
      email: mockProfile.email,
      name: mockProfile.name,
      avatar: mockProfile.avatar,
      providers: { google: mockProfile.googleId }
    };
    jest.spyOn(OAuthService, 'exchangeGoogleCode').mockResolvedValue(mockProfile);
    jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(existingUser);
    const tokenSpy = jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_oauth_jwt_usr_777');

    await handleGoogleCallback(req, res);

    expect(tokenSpy).toHaveBeenCalledWith({ id: 'usr_777', email: mockProfile.email });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Google authentication successful',
      data: {
        token: 'mock_oauth_jwt_usr_777',
        user: {
          id: 'usr_777',
          name: mockProfile.name,
          email: mockProfile.email,
          avatar: mockProfile.avatar
        }
      }
    });
  });
});

describe('handleGithubCallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when code is missing', async () => {
    const req = { query: {} };
    const res = createRes();

    await handleGithubCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authorization code is missing from callback'
    });
  });

  test('returns 401 when exchangeGithubCode throws', async () => {
    const req = { query: { code: 'invalid_code' } };
    const res = createRes();

    await handleGithubCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication failed: Invalid GitHub authorization code'
    });
  });

  test('returns 422 when GitHub profile has no email', async () => {
    const req = { query: { code: 'valid_code' } };
    const res = createRes();

    const profileNoEmail = {
      githubId: 'gh_99887766',
      email: null,
      username: 'arivera',
      avatar: 'https://avatars.githubusercontent.com/u/99887766'
    };
    jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue(profileNoEmail);

    await handleGithubCallback(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Unable to retrieve verified email from GitHub account'
    });
  });

  test('creates a new user when none exists', async () => {
    const req = { query: { code: 'valid_code' } };
    const res = createRes();

    const profile = {
      githubId: 'gh_99887766',
      email: 'alex.rivera@github.com',
      username: 'arivera',
      avatar: 'https://avatars.githubusercontent.com/u/99887766'
    };
    jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue(profile);
    jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
    jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(null);
    const createSpy = jest.spyOn(OAuthUser, 'create').mockImplementation(async (data) => ({
      id: 'usr_2222',
      ...data,
      createdAt: new Date()
    }));
    const tokenSpy = jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_oauth_jwt_usr_2222');

    await handleGithubCallback(req, res);

    expect(createSpy).toHaveBeenCalledWith({
      email: profile.email,
      name: profile.username,
      avatar: profile.avatar,
      providers: { github: profile.githubId },
      isEmailVerified: true
    });
    expect(tokenSpy).toHaveBeenCalledWith({ id: 'usr_2222', email: profile.email });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'GitHub authentication successful',
      data: {
        token: 'mock_oauth_jwt_usr_2222',
        user: {
          id: 'usr_2222',
          name: profile.username,
          email: profile.email,
          avatar: profile.avatar
        }
      }
    });
  });

  test('links provider to existing email user when provider not linked', async () => {
    const req = { query: { code: 'valid_code' } };
    const res = createRes();

    const profile = {
      githubId: 'gh_99887766',
      email: 'alex.rivera@github.com',
      username: 'arivera',
      avatar: 'https://avatars.githubusercontent.com/u/99887766'
    };
    jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue(profile);
    jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
    const existingUser = {
      id: 'usr_3333',
      email: profile.email,
      name: 'Alex R.',
      avatar: 'old_avatar',
      providers: {}
    };
    jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(existingUser);
    const linkSpy = jest.spyOn(OAuthUser, 'linkProvider').mockResolvedValue(true);
    const tokenSpy = jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_oauth_jwt_usr_3333');

    await handleGithubCallback(req, res);

    expect(linkSpy).toHaveBeenCalledWith('usr_3333', 'github', profile.githubId);
    expect(tokenSpy).toHaveBeenCalledWith({ id: 'usr_3333', email: profile.email });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'GitHub authentication successful',
      data: {
        token: 'mock_oauth_jwt_usr_3333',
        user: {
          id: 'usr_3333',
          name: existingUser.name,
          email: existingUser.email,
          avatar: existingUser.avatar
        }
      }
    });
  });

  test('returns existing provider user without extra actions', async () => {
    const req = { query: { code: 'valid_code' } };
    const res = createRes();

    const profile = {
      githubId: 'gh_99887766',
      email: 'alex.rivera@github.com',
      username: 'arivera',
      avatar: 'https://avatars.githubusercontent.com/u/99887766'
    };
    const existingUser = {
      id: 'usr_4444',
      email: profile.email,
      name: profile.username,
      avatar: profile.avatar,
      providers: { github: profile.githubId }
    };
    jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue(profile);
    jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(existingUser);
    const tokenSpy = jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_oauth_jwt_usr_4444');

    await handleGithubCallback(req, res);

    expect(tokenSpy).toHaveBeenCalledWith({ id: 'usr_4444', email: profile.email });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'GitHub authentication successful',
      data: {
        token: 'mock_oauth_jwt_usr_4444',
        user: {
          id: 'usr_4444',
          name: profile.username,
          email: profile.email,
          avatar: profile.avatar
        }
      }
    });
  });
});