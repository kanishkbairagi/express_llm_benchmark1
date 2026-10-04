import { jest } from '@jest/globals';
import {
  handleGoogleCallback,
  handleGithubCallback,
  OAuthUser,
  OAuthService
} from '../dataset/11_oauth_controller.js';

describe('OAuth Controller Unit Tests', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockReq = { query: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('handleGoogleCallback', () => {
    test('should return 400 if authorization code is missing', async () => {
      mockReq.query = {};

      await handleGoogleCallback(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authorization code is missing from callback'
      });
    });

    test('should handle missing req.query gracefully and return 400', async () => {
      await handleGoogleCallback({}, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authorization code is missing from callback'
      });
    });

    test('should return 401 if exchangeGoogleCode fails', async () => {
      mockReq.query = { code: 'invalid_code' };
      jest.spyOn(OAuthService, 'exchangeGoogleCode').mockRejectedValue(new Error('Bad verification code'));

      await handleGoogleCallback(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication failed: Invalid authorization code'
      });
    });

    test('should authenticate existing user found by provider ID', async () => {
      mockReq.query = { code: 'valid_google_code' };
      const googleProfile = {
        googleId: 'g_12345',
        email: 'user@gmail.com',
        name: 'Test User',
        avatar: 'https://example.com/avatar.jpg'
      };
      const existingUser = {
        id: 'usr_123',
        email: 'user@gmail.com',
        name: 'Test User',
        avatar: 'https://example.com/avatar.jpg'
      };

      jest.spyOn(OAuthService, 'exchangeGoogleCode').mockResolvedValue(googleProfile);
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(existingUser);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_token');

      await handleGoogleCallback(mockReq, mockRes);

      expect(OAuthUser.findByProviderId).toHaveBeenCalledWith('google', 'g_12345');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Google authentication successful',
        data: {
          token: 'mock_token',
          user: {
            id: existingUser.id,
            name: existingUser.name,
            email: existingUser.email,
            avatar: existingUser.avatar
          }
        }
      });
    });

    test('should link Google provider if user exists by email but not by provider ID', async () => {
      mockReq.query = { code: 'valid_google_code' };
      const googleProfile = {
        googleId: 'g_12345',
        email: 'user@gmail.com',
        name: 'Test User',
        avatar: 'https://example.com/avatar.jpg'
      };
      const existingEmailUser = {
        id: 'usr_existing',
        email: 'user@gmail.com',
        name: 'Test User',
        avatar: 'https://example.com/avatar.jpg'
      };

      jest.spyOn(OAuthService, 'exchangeGoogleCode').mockResolvedValue(googleProfile);
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(existingEmailUser);
      jest.spyOn(OAuthUser, 'linkProvider').mockResolvedValue(true);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_token');

      await handleGoogleCallback(mockReq, mockRes);

      expect(OAuthUser.findByEmail).toHaveBeenCalledWith('user@gmail.com');
      expect(OAuthUser.linkProvider).toHaveBeenCalledWith('usr_existing', 'google', 'g_12345');
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    test('should create new user if user does not exist by provider ID or email', async () => {
      mockReq.query = { code: 'valid_google_code' };
      const googleProfile = {
        googleId: 'g_12345',
        email: 'newuser@gmail.com',
        name: 'New User',
        avatar: 'https://example.com/avatar.jpg'
      };
      const newUser = {
        id: 'usr_new',
        email: 'newuser@gmail.com',
        name: 'New User',
        avatar: 'https://example.com/avatar.jpg'
      };

      jest.spyOn(OAuthService, 'exchangeGoogleCode').mockResolvedValue(googleProfile);
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'create').mockResolvedValue(newUser);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_token');

      await handleGoogleCallback(mockReq, mockRes);

      expect(OAuthUser.create).toHaveBeenCalledWith({
        email: googleProfile.email,
        name: googleProfile.name,
        avatar: googleProfile.avatar,
        providers: { google: 'g_12345' },
        isEmailVerified: true
      });
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    test('should return 500 when an unexpected internal error occurs', async () => {
      mockReq.query = { code: 'valid_google_code' };
      jest.spyOn(OAuthService, 'exchangeGoogleCode').mockImplementation(() => {
        throw new Error('Unexpected crash');
      });

      await handleGoogleCallback(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Google OAuth callback processing error',
        details: 'Unexpected crash'
      });
    });
  });

  describe('handleGithubCallback', () => {
    test('should return 400 if authorization code is missing', async () => {
      mockReq.query = {};

      await handleGithubCallback(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authorization code is missing from callback'
      });
    });

    test('should return 401 if exchangeGithubCode fails', async () => {
      mockReq.query = { code: 'invalid_code' };
      jest.spyOn(OAuthService, 'exchangeGithubCode').mockRejectedValue(new Error('Bad verification code'));

      await handleGithubCallback(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication failed: Invalid GitHub authorization code'
      });
    });

    test('should return 422 if email is missing from GitHub profile', async () => {
      mockReq.query = { code: 'valid_github_code' };
      const githubProfile = {
        githubId: 'gh_9999',
        email: null,
        username: 'noemailuser',
        avatar: 'https://github.com/avatar.jpg'
      };

      jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue(githubProfile);

      await handleGithubCallback(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(422);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unable to retrieve verified email from GitHub account'
      });
    });

    test('should authenticate existing user found by provider ID', async () => {
      mockReq.query = { code: 'valid_github_code' };
      const githubProfile = {
        githubId: 'gh_99887766',
        email: 'alex.rivera@github.com',
        username: 'arivera',
        avatar: 'https://avatars.githubusercontent.com/u/99887766'
      };
      const existingUser = {
        id: 'usr_gh_1',
        email: 'alex.rivera@github.com',
        name: 'arivera',
        avatar: 'https://avatars.githubusercontent.com/u/99887766'
      };

      jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue(githubProfile);
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(existingUser);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_jwt');

      await handleGithubCallback(mockReq, mockRes);

      expect(OAuthUser.findByProviderId).toHaveBeenCalledWith('github', 'gh_99887766');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'GitHub authentication successful',
        data: {
          token: 'mock_jwt',
          user: {
            id: existingUser.id,
            name: existingUser.name,
            email: existingUser.email,
            avatar: existingUser.avatar
          }
        }
      });
    });

    test('should link GitHub provider if user exists by email', async () => {
      mockReq.query = { code: 'valid_github_code' };
      const githubProfile = {
        githubId: 'gh_99887766',
        email: 'alex.rivera@github.com',
        username: 'arivera',
        avatar: 'https://avatars.githubusercontent.com/u/99887766'
      };
      const existingUser = {
        id: 'usr_existing_gh',
        email: 'alex.rivera@github.com',
        name: 'Alex Rivera',
        avatar: 'https://example.com/avatar.jpg'
      };

      jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue(githubProfile);
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(existingUser);
      jest.spyOn(OAuthUser, 'linkProvider').mockResolvedValue(true);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_jwt');

      await handleGithubCallback(mockReq, mockRes);

      expect(OAuthUser.findByEmail).toHaveBeenCalledWith('alex.rivera@github.com');
      expect(OAuthUser.linkProvider).toHaveBeenCalledWith('usr_existing_gh', 'github', 'gh_99887766');
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    test('should create a new user if not found by provider or email', async () => {
      mockReq.query = { code: 'valid_github_code' };
      const githubProfile = {
        githubId: 'gh_99887766',
        email: 'alex.rivera@github.com',
        username: 'arivera',
        avatar: 'https://avatars.githubusercontent.com/u/99887766'
      };
      const createdUser = {
        id: 'usr_created',
        email: 'alex.rivera@github.com',
        name: 'arivera',
        avatar: 'https://avatars.githubusercontent.com/u/99887766'
      };

      jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue(githubProfile);
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'create').mockResolvedValue(createdUser);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_jwt');

      await handleGithubCallback(mockReq, mockRes);

      expect(OAuthUser.create).toHaveBeenCalledWith({
        email: githubProfile.email,
        name: githubProfile.username,
        avatar: githubProfile.avatar,
        providers: { github: 'gh_99887766' },
        isEmailVerified: true
      });
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    test('should return 500 when an unexpected internal error occurs', async () => {
      mockReq.query = { code: 'valid_github_code' };
      jest.spyOn(OAuthService, 'exchangeGithubCode').mockImplementation(() => {
        throw new Error('Database Error');
      });

      await handleGithubCallback(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'GitHub OAuth callback processing error',
        details: 'Database Error'
      });
    });
  });
});