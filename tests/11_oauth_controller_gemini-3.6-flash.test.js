import { jest } from '@jest/globals';
import {
  handleGoogleCallback,
  handleGithubCallback,
  OAuthUser,
  OAuthService
} from '../dataset/11_oauth_controller.js';

describe('OAuth Controller Unit Tests', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();

    req = { query: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('handleGoogleCallback', () => {
    test('should return 400 if code is missing from query params', async () => {
      req.query = {};

      await handleGoogleCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authorization code is missing from callback'
      });
    });

    test('should return 401 if code exchange fails', async () => {
      req.query = { code: 'invalid_code' };

      await handleGoogleCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication failed: Invalid authorization code'
      });
    });

    test('should login existing user found by provider ID', async () => {
      req.query = { code: 'valid_google_code' };

      const mockUser = {
        id: 'usr_google_123',
        email: 'alex@gmail.com',
        name: 'Alex Rivera',
        avatar: 'https://lh3.googleusercontent.com/a/mock'
      };

      jest.spyOn(OAuthService, 'exchangeGoogleCode').mockResolvedValue({
        googleId: 'g_1029384756',
        email: 'alex@gmail.com',
        name: 'Alex Rivera',
        avatar: 'https://lh3.googleusercontent.com/a/mock'
      });
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(mockUser);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_jwt_token');

      await handleGoogleCallback(req, res);

      expect(OAuthUser.findByProviderId).toHaveBeenCalledWith('google', 'g_1029384756');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Google authentication successful',
        data: {
          token: 'mock_jwt_token',
          user: {
            id: mockUser.id,
            name: mockUser.name,
            email: mockUser.email,
            avatar: mockUser.avatar
          }
        }
      });
    });

    test('should link provider if user exists by email but not provider ID', async () => {
      req.query = { code: 'valid_google_code' };

      const mockExistingUser = {
        id: 'usr_existing_456',
        email: 'alex@gmail.com',
        name: 'Alex Existing',
        avatar: 'https://lh3.googleusercontent.com/a/mock'
      };

      jest.spyOn(OAuthService, 'exchangeGoogleCode').mockResolvedValue({
        googleId: 'g_1029384756',
        email: 'alex@gmail.com',
        name: 'Alex Rivera',
        avatar: 'https://lh3.googleusercontent.com/a/mock'
      });
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(mockExistingUser);
      jest.spyOn(OAuthUser, 'linkProvider').mockResolvedValue(true);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_jwt_token');

      await handleGoogleCallback(req, res);

      expect(OAuthUser.linkProvider).toHaveBeenCalledWith('usr_existing_456', 'google', 'g_1029384756');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should create new user if user does not exist by provider ID or email', async () => {
      req.query = { code: 'valid_google_code' };

      const newCreatedUser = {
        id: 'usr_new_789',
        email: 'newuser@gmail.com',
        name: 'New User',
        avatar: 'https://lh3.googleusercontent.com/a/new'
      };

      jest.spyOn(OAuthService, 'exchangeGoogleCode').mockResolvedValue({
        googleId: 'g_new_123',
        email: 'newuser@gmail.com',
        name: 'New User',
        avatar: 'https://lh3.googleusercontent.com/a/new'
      });
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'create').mockResolvedValue(newCreatedUser);

      await handleGoogleCallback(req, res);

      expect(OAuthUser.create).toHaveBeenCalledWith({
        email: 'newuser@gmail.com',
        name: 'New User',
        avatar: 'https://lh3.googleusercontent.com/a/new',
        providers: { google: 'g_new_123' },
        isEmailVerified: true
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should handle internal errors and return 500', async () => {
      req.query = { code: 'valid_google_code' };

      jest.spyOn(OAuthService, 'exchangeGoogleCode').mockResolvedValue({
        googleId: 'g_1029384756',
        email: 'alex@gmail.com',
        name: 'Alex Rivera',
        avatar: 'https://lh3.googleusercontent.com/a/mock'
      });
      jest.spyOn(OAuthUser, 'findByProviderId').mockRejectedValue(new Error('Database error'));

      await handleGoogleCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Google OAuth callback processing error',
        details: 'Database error'
      });
    });
  });

  describe('handleGithubCallback', () => {
    test('should return 400 if code is missing from query params', async () => {
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

      await handleGithubCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication failed: Invalid GitHub authorization code'
      });
    });

    test('should return 422 if email is missing from GitHub profile', async () => {
      req.query = { code: 'valid_github_code' };

      jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue({
        githubId: 'gh_99887766',
        email: null,
        username: 'noemailuser',
        avatar: 'https://avatars.githubusercontent.com/u/99887766'
      });

      await handleGithubCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unable to retrieve verified email from GitHub account'
      });
    });

    test('should login existing user found by provider ID', async () => {
      req.query = { code: 'valid_github_code' };

      const mockUser = {
        id: 'usr_github_123',
        email: 'alex.rivera@github.com',
        name: 'arivera',
        avatar: 'https://avatars.githubusercontent.com/u/99887766'
      };

      jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue({
        githubId: 'gh_99887766',
        email: 'alex.rivera@github.com',
        username: 'arivera',
        avatar: 'https://avatars.githubusercontent.com/u/99887766'
      });
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(mockUser);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_jwt_token_github');

      await handleGithubCallback(req, res);

      expect(OAuthUser.findByProviderId).toHaveBeenCalledWith('github', 'gh_99887766');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'GitHub authentication successful',
        data: {
          token: 'mock_jwt_token_github',
          user: {
            id: mockUser.id,
            name: mockUser.name,
            email: mockUser.email,
            avatar: mockUser.avatar
          }
        }
      });
    });

    test('should link provider if user exists by email but not GitHub provider ID', async () => {
      req.query = { code: 'valid_github_code' };

      const mockExistingUser = {
        id: 'usr_existing_gh',
        email: 'alex.rivera@github.com',
        name: 'Existing User',
        avatar: 'https://avatars.githubusercontent.com/u/99887766'
      };

      jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue({
        githubId: 'gh_99887766',
        email: 'alex.rivera@github.com',
        username: 'arivera',
        avatar: 'https://avatars.githubusercontent.com/u/99887766'
      });
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(mockExistingUser);
      jest.spyOn(OAuthUser, 'linkProvider').mockResolvedValue(true);

      await handleGithubCallback(req, res);

      expect(OAuthUser.linkProvider).toHaveBeenCalledWith('usr_existing_gh', 'github', 'gh_99887766');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should create new user if GitHub user does not exist by provider ID or email', async () => {
      req.query = { code: 'valid_github_code' };

      const newCreatedUser = {
        id: 'usr_new_github',
        email: 'newgithub@github.com',
        name: 'newghuser',
        avatar: 'https://avatars.githubusercontent.com/u/112233'
      };

      jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue({
        githubId: 'gh_112233',
        email: 'newgithub@github.com',
        username: 'newghuser',
        avatar: 'https://avatars.githubusercontent.com/u/112233'
      });
      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'create').mockResolvedValue(newCreatedUser);

      await handleGithubCallback(req, res);

      expect(OAuthUser.create).toHaveBeenCalledWith({
        email: 'newgithub@github.com',
        name: 'newghuser',
        avatar: 'https://avatars.githubusercontent.com/u/112233',
        providers: { github: 'gh_112233' },
        isEmailVerified: true
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should handle internal errors and return 500', async () => {
      req.query = { code: 'valid_github_code' };

      jest.spyOn(OAuthService, 'exchangeGithubCode').mockRejectedValue(new Error('Unexpected network failure'));

      await handleGithubCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(401); // Caught by exchangeGithubCode try-catch

      // For actual 500 catch block test
      jest.spyOn(OAuthService, 'exchangeGithubCode').mockResolvedValue({
        githubId: 'gh_112233',
        email: 'test@github.com',
        username: 'test',
        avatar: 'avatar'
      });
      jest.spyOn(OAuthUser, 'findByProviderId').mockRejectedValue(new Error('Fatal DB Error'));

      await handleGithubCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'GitHub OAuth callback processing error',
        details: 'Fatal DB Error'
      });
    });
  });
});