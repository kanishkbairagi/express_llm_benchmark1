import { jest } from '@jest/globals';
import {
  OAuthUser,
  OAuthService,
  handleGoogleCallback,
  handleGithubCallback
} from '../dataset/11_oauth_controller.js';

describe('OAuth Controller', () => {
  let req;
  let res;

  beforeEach(() => {
    req = { query: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('handleGoogleCallback', () => {
    test('should return 400 if authorization code is missing', async () => {
      req.query = {};

      await handleGoogleCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authorization code is missing from callback'
      });
    });

    test('should return 400 if req.query is undefined', async () => {
      req = {};

      await handleGoogleCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authorization code is missing from callback'
      });
    });

    test('should return 401 if Google code exchange fails', async () => {
      req.query = { code: 'invalid_code' };
      jest.spyOn(OAuthService, 'exchangeGoogleCode').mockRejectedValue(new Error('Bad verification code'));

      await handleGoogleCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication failed: Invalid authorization code'
      });
    });

    test('should return 200 and login directly if user is found by provider ID', async () => {
      req.query = { code: 'valid_code' };
      const mockProfile = {
        googleId: 'g_123',
        email: 'test@gmail.com',
        name: 'Test User',
        avatar: 'https://avatar.com'
      };
      const mockUser = {
        id: 'usr_1',
        email: 'test@gmail.com',
        name: 'Test User',
        avatar: 'https://avatar.com'
      };

      jest.spyOn(OAuthService, 'exchangeGoogleCode').mockResolvedValue(mockProfile);
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(mockUser);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('jwt_token_123');

      await handleGoogleCallback(req, res);

      expect(OAuthUser.findByProviderId).toHaveBeenCalledWith('google', 'g_123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Google authentication successful',
        data: {
          token: 'jwt_token_123',
          user: {
            id: mockUser.id,
            name: mockUser.name,
            email: mockUser.email,
            avatar: mockUser.avatar
          }
        }
      });
    });

    test('should link provider and return 200 if user exists by email but not provider ID', async () => {
      req.query = { code: 'valid_code' };
      const mockProfile = {
        googleId: 'g_123',
        email: 'test@gmail.com',
        name: 'Test User',
        avatar: 'https://avatar.com'
      };
      const mockUser = {
        id: 'usr_1',
        email: 'test@gmail.com',
        name: 'Test User',
        avatar: 'https://avatar.com'
      };

      jest.spyOn(OAuthService, 'exchangeGoogleCode').mockResolvedValue(mockProfile);
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(mockUser);
      jest.spyOn(OAuthUser, 'linkProvider').mockResolvedValue(true);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('jwt_token_123');

      await handleGoogleCallback(req, res);

      expect(OAuthUser.findByEmail).toHaveBeenCalledWith('test@gmail.com');
      expect(OAuthUser.linkProvider).toHaveBeenCalledWith('usr_1', 'google', 'g_123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Google authentication successful',
        data: {
          token: 'jwt_token_123',
          user: {
            id: mockUser.id,
            name: mockUser.name,
            email: mockUser.email,
            avatar: mockUser.avatar
          }
        }
      });
    });

    test('should create new user and return 200 if user does not exist by provider ID or email', async () => {
      req.query = { code: 'valid_code' };
      const mockProfile = {
        googleId: 'g_123',
        email: 'new@gmail.com',
        name: 'New User',
        avatar: 'https://avatar.com/new'
      };
      const createdUser = {
        id: 'usr_2',
        email: 'new@gmail.com',
        name: 'New User',
        avatar: 'https://avatar.com/new',
        providers: { google: 'g_123' },
        isEmailVerified: true
      };

      jest.spyOn(OAuthService, 'exchangeGoogleCode').mockResolvedValue(mockProfile);
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'create').mockResolvedValue(createdUser);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('jwt_token_456');

      await handleGoogleCallback(req, res);

      expect(OAuthUser.create).toHaveBeenCalledWith({
        email: 'new@gmail.com',
        name: 'New User',
        avatar: 'https://avatar.com/new',
        providers: { google: 'g_123' },
        isEmailVerified: true
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Google authentication successful',
        data: {
          token: 'jwt_token_456',
          user: {
            id: createdUser.id,
            name: createdUser.name,
            email: createdUser.email,
            avatar: createdUser.avatar
          }
        }
      });
    });

    test('should return 500 when an unexpected internal error occurs', async () => {
      req.query = { code: 'valid_code' };
      jest.spyOn(OAuthService, 'exchangeGoogleCode').mockResolvedValue({
        googleId: 'g_123',
        email: 'test@gmail.com'
      });
      jest.spyOn(OAuthUser, 'findByProviderId').mockRejectedValue(new Error('Database failure'));

      await handleGoogleCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Google OAuth callback processing error',
        details: 'Database failure'
      });
    });
  });

  describe('handleGithubCallback', () => {
    test('should return 400 if authorization code is missing', async () => {
      req.query = {};

      await handleGithubCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authorization code is missing from callback'
      });
    });

    test('should return 401 if GitHub code exchange fails', async () => {
      req.query = { code: 'invalid_code' };
      jest.spyOn(OAuthService, 'exchangeGithubCode').mockRejectedValue(new Error('Bad verification code'));

      await handleGithubCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication failed: Invalid GitHub authorization code'
      });
    });

    test('should return 422 if GitHub profile email is missing', async () => {
      req.query = { code: 'valid_code' };
      jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue({
        githubId: 'gh_123',
        email: null,
        username: 'ghuser',
        avatar: 'https://github.com/avatar'
      });

      await handleGithubCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unable to retrieve verified email from GitHub account'
      });
    });

    test('should return 200 and login directly if user is found by provider ID', async () => {
      req.query = { code: 'valid_code' };
      const mockProfile = {
        githubId: 'gh_123',
        email: 'test@github.com',
        username: 'ghuser',
        avatar: 'https://github.com/avatar'
      };
      const mockUser = {
        id: 'usr_gh_1',
        email: 'test@github.com',
        name: 'ghuser',
        avatar: 'https://github.com/avatar'
      };

      jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue(mockProfile);
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(mockUser);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('jwt_github_123');

      await handleGithubCallback(req, res);

      expect(OAuthUser.findByProviderId).toHaveBeenCalledWith('github', 'gh_123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'GitHub authentication successful',
        data: {
          token: 'jwt_github_123',
          user: {
            id: mockUser.id,
            name: mockUser.name,
            email: mockUser.email,
            avatar: mockUser.avatar
          }
        }
      });
    });

    test('should link provider and return 200 if user exists by email but not provider ID', async () => {
      req.query = { code: 'valid_code' };
      const mockProfile = {
        githubId: 'gh_123',
        email: 'test@github.com',
        username: 'ghuser',
        avatar: 'https://github.com/avatar'
      };
      const mockUser = {
        id: 'usr_gh_1',
        email: 'test@github.com',
        name: 'Existing User',
        avatar: 'https://github.com/avatar'
      };

      jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue(mockProfile);
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(mockUser);
      jest.spyOn(OAuthUser, 'linkProvider').mockResolvedValue(true);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('jwt_github_123');

      await handleGithubCallback(req, res);

      expect(OAuthUser.findByEmail).toHaveBeenCalledWith('test@github.com');
      expect(OAuthUser.linkProvider).toHaveBeenCalledWith('usr_gh_1', 'github', 'gh_123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'GitHub authentication successful',
        data: {
          token: 'jwt_github_123',
          user: {
            id: mockUser.id,
            name: mockUser.name,
            email: mockUser.email,
            avatar: mockUser.avatar
          }
        }
      });
    });

    test('should create new user and return 200 if user does not exist', async () => {
      req.query = { code: 'valid_code' };
      const mockProfile = {
        githubId: 'gh_123',
        email: 'new@github.com',
        username: 'ghnewuser',
        avatar: 'https://github.com/new'
      };
      const createdUser = {
        id: 'usr_gh_2',
        email: 'new@github.com',
        name: 'ghnewuser',
        avatar: 'https://github.com/new',
        providers: { github: 'gh_123' },
        isEmailVerified: true
      };

      jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue(mockProfile);
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'create').mockResolvedValue(createdUser);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('jwt_github_456');

      await handleGithubCallback(req, res);

      expect(OAuthUser.create).toHaveBeenCalledWith({
        email: 'new@github.com',
        name: 'ghnewuser',
        avatar: 'https://github.com/new',
        providers: { github: 'gh_123' },
        isEmailVerified: true
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'GitHub authentication successful',
        data: {
          token: 'jwt_github_456',
          user: {
            id: createdUser.id,
            name: createdUser.name,
            email: createdUser.email,
            avatar: createdUser.avatar
          }
        }
      });
    });

    test('should return 500 when an unexpected internal error occurs', async () => {
      req.query = { code: 'valid_code' };
      jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue({
        githubId: 'gh_123',
        email: 'test@github.com',
        username: 'ghuser'
      });
      jest.spyOn(OAuthUser, 'findByProviderId').mockRejectedValue(new Error('GitHub DB Failure'));

      await handleGithubCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'GitHub OAuth callback processing error',
        details: 'GitHub DB Failure'
      });
    });
  });
});