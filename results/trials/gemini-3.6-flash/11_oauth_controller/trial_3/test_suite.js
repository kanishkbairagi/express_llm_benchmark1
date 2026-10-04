import { jest } from '@jest/globals';
import {
  OAuthUser,
  OAuthService,
  handleGoogleCallback,
  handleGithubCallback
} from '../dataset/11_oauth_controller.js';

describe('OAuth Controller Unit Tests', () => {
  let req;
  let res;

  beforeEach(() => {
    req = { query: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  describe('handleGoogleCallback', () => {
    test('should return 400 if code is missing from req.query', async () => {
      req.query = {};

      await handleGoogleCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authorization code is missing from callback'
      });
    });

    test('should return 400 if req.query is undefined', async () => {
      req.query = undefined;

      await handleGoogleCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authorization code is missing from callback'
      });
    });

    test('should return 401 if exchangeGoogleCode fails', async () => {
      req.query = { code: 'invalid_code' };

      await handleGoogleCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication failed: Invalid authorization code'
      });
    });

    test('should authenticate existing user found by Google provider ID', async () => {
      req.query = { code: 'valid_google_code' };
      const mockProfile = {
        googleId: 'g_123',
        email: 'test@gmail.com',
        name: 'Test User',
        avatar: 'https://avatar.com/google'
      };
      const mockExistingUser = {
        id: 'usr_existing_1',
        name: 'Test User',
        email: 'test@gmail.com',
        avatar: 'https://avatar.com/google'
      };

      jest.spyOn(OAuthService, 'exchangeGoogleCode').mockResolvedValue(mockProfile);
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(mockExistingUser);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_jwt_token');

      await handleGoogleCallback(req, res);

      expect(OAuthUser.findByProviderId).toHaveBeenCalledWith('google', 'g_123');
      expect(OAuthService.generateJwt).toHaveBeenCalledWith({
        id: mockExistingUser.id,
        email: mockExistingUser.email
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Google authentication successful',
        data: {
          token: 'mock_jwt_token',
          user: {
            id: mockExistingUser.id,
            name: mockExistingUser.name,
            email: mockExistingUser.email,
            avatar: mockExistingUser.avatar
          }
        }
      });
    });

    test('should link Google provider if user found by email', async () => {
      req.query = { code: 'valid_google_code' };
      const mockProfile = {
        googleId: 'g_123',
        email: 'existing@gmail.com',
        name: 'Existing User',
        avatar: 'https://avatar.com/google'
      };
      const mockEmailUser = {
        id: 'usr_email_1',
        email: 'existing@gmail.com',
        name: 'Existing User',
        avatar: 'https://avatar.com/old'
      };

      jest.spyOn(OAuthService, 'exchangeGoogleCode').mockResolvedValue(mockProfile);
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(mockEmailUser);
      jest.spyOn(OAuthUser, 'linkProvider').mockResolvedValue(true);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_jwt_token');

      await handleGoogleCallback(req, res);

      expect(OAuthUser.findByProviderId).toHaveBeenCalledWith('google', 'g_123');
      expect(OAuthUser.findByEmail).toHaveBeenCalledWith('existing@gmail.com');
      expect(OAuthUser.linkProvider).toHaveBeenCalledWith('usr_email_1', 'google', 'g_123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Google authentication successful',
        data: {
          token: 'mock_jwt_token',
          user: {
            id: mockEmailUser.id,
            name: mockEmailUser.name,
            email: mockEmailUser.email,
            avatar: mockEmailUser.avatar
          }
        }
      });
    });

    test('should create new user if not found by provider ID or email', async () => {
      req.query = { code: 'valid_google_code' };
      const mockProfile = {
        googleId: 'g_456',
        email: 'new@gmail.com',
        name: 'New User',
        avatar: 'https://avatar.com/new'
      };
      const mockCreatedUser = {
        id: 'usr_new_1',
        email: 'new@gmail.com',
        name: 'New User',
        avatar: 'https://avatar.com/new',
        providers: { google: 'g_456' },
        isEmailVerified: true
      };

      jest.spyOn(OAuthService, 'exchangeGoogleCode').mockResolvedValue(mockProfile);
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'create').mockResolvedValue(mockCreatedUser);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_jwt_token');

      await handleGoogleCallback(req, res);

      expect(OAuthUser.create).toHaveBeenCalledWith({
        email: 'new@gmail.com',
        name: 'New User',
        avatar: 'https://avatar.com/new',
        providers: { google: 'g_456' },
        isEmailVerified: true
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Google authentication successful',
        data: {
          token: 'mock_jwt_token',
          user: {
            id: mockCreatedUser.id,
            name: mockCreatedUser.name,
            email: mockCreatedUser.email,
            avatar: mockCreatedUser.avatar
          }
        }
      });
    });

    test('should return 500 when an unhandled exception occurs', async () => {
      req.query = { code: 'valid_google_code' };

      jest.spyOn(OAuthService, 'exchangeGoogleCode').mockImplementation(() => {
        throw new Error('Database connection crashed');
      });

      await handleGoogleCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Google OAuth callback processing error',
        details: 'Database connection crashed'
      });
    });
  });

  describe('handleGithubCallback', () => {
    test('should return 400 if code is missing from req.query', async () => {
      req.query = {};

      await handleGithubCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authorization code is missing from callback'
      });
    });

    test('should return 400 if req.query is undefined', async () => {
      req.query = undefined;

      await handleGithubCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authorization code is missing from callback'
      });
    });

    test('should return 401 if exchangeGithubCode fails', async () => {
      req.query = { code: 'invalid_code' };

      await handleGithubCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication failed: Invalid GitHub authorization code'
      });
    });

    test('should return 422 if GitHub profile lacks email', async () => {
      req.query = { code: 'valid_github_code' };
      const mockProfile = {
        githubId: 'gh_123',
        email: null,
        username: 'noemailuser',
        avatar: 'https://avatar.github.com/u/123'
      };

      jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue(mockProfile);

      await handleGithubCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unable to retrieve verified email from GitHub account'
      });
    });

    test('should authenticate existing user found by GitHub provider ID', async () => {
      req.query = { code: 'valid_github_code' };
      const mockProfile = {
        githubId: 'gh_123',
        email: 'alex@github.com',
        username: 'arivera',
        avatar: 'https://avatar.github.com/u/123'
      };
      const mockExistingUser = {
        id: 'usr_gh_1',
        name: 'arivera',
        email: 'alex@github.com',
        avatar: 'https://avatar.github.com/u/123'
      };

      jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue(mockProfile);
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(mockExistingUser);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_jwt_token_github');

      await handleGithubCallback(req, res);

      expect(OAuthUser.findByProviderId).toHaveBeenCalledWith('github', 'gh_123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'GitHub authentication successful',
        data: {
          token: 'mock_jwt_token_github',
          user: {
            id: mockExistingUser.id,
            name: mockExistingUser.name,
            email: mockExistingUser.email,
            avatar: mockExistingUser.avatar
          }
        }
      });
    });

    test('should link GitHub provider if user found by email', async () => {
      req.query = { code: 'valid_github_code' };
      const mockProfile = {
        githubId: 'gh_123',
        email: 'existing@domain.com',
        username: 'gh_user',
        avatar: 'https://avatar.github.com/u/123'
      };
      const mockEmailUser = {
        id: 'usr_email_2',
        email: 'existing@domain.com',
        name: 'Existing Account',
        avatar: 'https://avatar.com/old'
      };

      jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue(mockProfile);
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(mockEmailUser);
      jest.spyOn(OAuthUser, 'linkProvider').mockResolvedValue(true);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_jwt_token');

      await handleGithubCallback(req, res);

      expect(OAuthUser.findByProviderId).toHaveBeenCalledWith('github', 'gh_123');
      expect(OAuthUser.findByEmail).toHaveBeenCalledWith('existing@domain.com');
      expect(OAuthUser.linkProvider).toHaveBeenCalledWith('usr_email_2', 'github', 'gh_123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'GitHub authentication successful',
        data: {
          token: 'mock_jwt_token',
          user: {
            id: mockEmailUser.id,
            name: mockEmailUser.name,
            email: mockEmailUser.email,
            avatar: mockEmailUser.avatar
          }
        }
      });
    });

    test('should create new user if not found by provider ID or email', async () => {
      req.query = { code: 'valid_github_code' };
      const mockProfile = {
        githubId: 'gh_789',
        email: 'new_github@domain.com',
        username: 'newgithubuser',
        avatar: 'https://avatar.github.com/u/789'
      };
      const mockCreatedUser = {
        id: 'usr_new_github',
        email: 'new_github@domain.com',
        name: 'newgithubuser',
        avatar: 'https://avatar.github.com/u/789',
        providers: { github: 'gh_789' },
        isEmailVerified: true
      };

      jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue(mockProfile);
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'create').mockResolvedValue(mockCreatedUser);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_jwt_token');

      await handleGithubCallback(req, res);

      expect(OAuthUser.create).toHaveBeenCalledWith({
        email: 'new_github@domain.com',
        name: 'newgithubuser',
        avatar: 'https://avatar.github.com/u/789',
        providers: { github: 'gh_789' },
        isEmailVerified: true
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'GitHub authentication successful',
        data: {
          token: 'mock_jwt_token',
          user: {
            id: mockCreatedUser.id,
            name: mockCreatedUser.name,
            email: mockCreatedUser.email,
            avatar: mockCreatedUser.avatar
          }
        }
      });
    });

    test('should return 500 when an unhandled exception occurs', async () => {
      req.query = { code: 'valid_github_code' };

      jest.spyOn(OAuthService, 'exchangeGithubCode').mockImplementation(() => {
        throw new Error('Unexpected network failure');
      });

      await handleGithubCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'GitHub OAuth callback processing error',
        details: 'Unexpected network failure'
      });
    });
  });
});