import { jest } from '@jest/globals';
import {
  handleGoogleCallback,
  handleGithubCallback,
  OAuthUser,
  OAuthService
} from '../dataset/11_oauth_controller.js';

describe('11_oauth_controller', () => {
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
    it('should return 400 if code is missing from query', async () => {
      req.query = {};

      await handleGoogleCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authorization code is missing from callback'
      });
    });

    it('should return 400 if req.query is undefined', async () => {
      req = {};

      await handleGoogleCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authorization code is missing from callback'
      });
    });

    it('should return 401 if exchangeGoogleCode fails', async () => {
      req.query = { code: 'invalid_code' };

      await handleGoogleCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication failed: Invalid authorization code'
      });
    });

    it('should return 200 and user data if user exists by provider id', async () => {
      req.query = { code: 'valid_google_code' };

      const existingUser = {
        id: 'usr_google_123',
        name: 'Alex Rivera',
        email: 'alex@gmail.com',
        avatar: 'https://lh3.googleusercontent.com/a/mock'
      };

      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(existingUser);
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
            id: existingUser.id,
            name: existingUser.name,
            email: existingUser.email,
            avatar: existingUser.avatar
          }
        }
      });
    });

    it('should link provider and return 200 if user exists by email but not by provider id', async () => {
      req.query = { code: 'valid_google_code' };

      const existingEmailUser = {
        id: 'usr_email_123',
        name: 'Alex Rivera',
        email: 'alex@gmail.com',
        avatar: 'https://lh3.googleusercontent.com/a/mock'
      };

      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(existingEmailUser);
      jest.spyOn(OAuthUser, 'linkProvider').mockResolvedValue(true);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_linked_jwt');

      await handleGoogleCallback(req, res);

      expect(OAuthUser.findByProviderId).toHaveBeenCalledWith('google', 'g_1029384756');
      expect(OAuthUser.findByEmail).toHaveBeenCalledWith('alex@gmail.com');
      expect(OAuthUser.linkProvider).toHaveBeenCalledWith('usr_email_123', 'google', 'g_1029384756');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Google authentication successful',
        data: {
          token: 'mock_linked_jwt',
          user: {
            id: existingEmailUser.id,
            name: existingEmailUser.name,
            email: existingEmailUser.email,
            avatar: existingEmailUser.avatar
          }
        }
      });
    });

    it('should create user and return 200 if user does not exist by provider id or email', async () => {
      req.query = { code: 'valid_google_code' };

      const createdUser = {
        id: 'usr_new_google',
        email: 'alex@gmail.com',
        name: 'Alex Rivera',
        avatar: 'https://lh3.googleusercontent.com/a/mock'
      };

      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'create').mockResolvedValue(createdUser);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_new_jwt');

      await handleGoogleCallback(req, res);

      expect(OAuthUser.create).toHaveBeenCalledWith({
        email: 'alex@gmail.com',
        name: 'Alex Rivera',
        avatar: 'https://lh3.googleusercontent.com/a/mock',
        providers: { google: 'g_1029384756' },
        isEmailVerified: true
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Google authentication successful',
        data: {
          token: 'mock_new_jwt',
          user: {
            id: createdUser.id,
            name: createdUser.name,
            email: createdUser.email,
            avatar: createdUser.avatar
          }
        }
      });
    });

    it('should return 500 if an unexpected error occurs', async () => {
      req.query = { code: 'valid_google_code' };

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
    it('should return 400 if code is missing from query', async () => {
      req.query = {};

      await handleGithubCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authorization code is missing from callback'
      });
    });

    it('should return 400 if req.query is undefined', async () => {
      req = {};

      await handleGithubCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authorization code is missing from callback'
      });
    });

    it('should return 401 if exchangeGithubCode fails', async () => {
      req.query = { code: 'invalid_code' };

      await handleGithubCallback(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication failed: Invalid GitHub authorization code'
      });
    });

    it('should return 422 if email is not retrieved from GitHub account', async () => {
      req.query = { code: 'valid_github_code' };

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

    it('should return 200 and user data if user exists by provider id', async () => {
      req.query = { code: 'valid_github_code' };

      const existingUser = {
        id: 'usr_github_123',
        name: 'arivera',
        email: 'alex.rivera@github.com',
        avatar: 'https://avatars.githubusercontent.com/u/99887766'
      };

      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(existingUser);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_github_jwt');

      await handleGithubCallback(req, res);

      expect(OAuthUser.findByProviderId).toHaveBeenCalledWith('github', 'gh_99887766');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'GitHub authentication successful',
        data: {
          token: 'mock_github_jwt',
          user: {
            id: existingUser.id,
            name: existingUser.name,
            email: existingUser.email,
            avatar: existingUser.avatar
          }
        }
      });
    });

    it('should link provider and return 200 if user exists by email but not provider id', async () => {
      req.query = { code: 'valid_github_code' };

      const existingEmailUser = {
        id: 'usr_existing_email',
        name: 'Alex Rivera',
        email: 'alex.rivera@github.com',
        avatar: 'https://avatars.githubusercontent.com/u/99887766'
      };

      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(existingEmailUser);
      jest.spyOn(OAuthUser, 'linkProvider').mockResolvedValue(true);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_github_linked_jwt');

      await handleGithubCallback(req, res);

      expect(OAuthUser.findByProviderId).toHaveBeenCalledWith('github', 'gh_99887766');
      expect(OAuthUser.findByEmail).toHaveBeenCalledWith('alex.rivera@github.com');
      expect(OAuthUser.linkProvider).toHaveBeenCalledWith('usr_existing_email', 'github', 'gh_99887766');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'GitHub authentication successful',
        data: {
          token: 'mock_github_linked_jwt',
          user: {
            id: existingEmailUser.id,
            name: existingEmailUser.name,
            email: existingEmailUser.email,
            avatar: existingEmailUser.avatar
          }
        }
      });
    });

    it('should create user and return 200 if user does not exist', async () => {
      req.query = { code: 'valid_github_code' };

      const createdUser = {
        id: 'usr_github_new',
        name: 'arivera',
        email: 'alex.rivera@github.com',
        avatar: 'https://avatars.githubusercontent.com/u/99887766'
      };

      jest.spyOn(OAuthUser, 'findByProviderId').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'findByEmail').mockResolvedValue(null);
      jest.spyOn(OAuthUser, 'create').mockResolvedValue(createdUser);
      jest.spyOn(OAuthService, 'generateJwt').mockReturnValue('mock_github_new_jwt');

      await handleGithubCallback(req, res);

      expect(OAuthUser.create).toHaveBeenCalledWith({
        email: 'alex.rivera@github.com',
        name: 'arivera',
        avatar: 'https://avatars.githubusercontent.com/u/99887766',
        providers: { github: 'gh_99887766' },
        isEmailVerified: true
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'GitHub authentication successful',
        data: {
          token: 'mock_github_new_jwt',
          user: {
            id: createdUser.id,
            name: createdUser.name,
            email: createdUser.email,
            avatar: createdUser.avatar
          }
        }
      });
    });

    it('should return 500 if an unexpected error occurs', async () => {
      req.query = { code: 'valid_github_code' };

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

  describe('OAuthUser & OAuthService Default Implementations', () => {
    it('should execute default mock functions for OAuthUser', async () => {
      expect(await OAuthUser.findByProviderId('google', '123')).toBeNull();
      expect(await OAuthUser.findByEmail('test@example.com')).toBeNull();
      expect(await OAuthUser.linkProvider('usr_1', 'google', '123')).toBe(true);

      const created = await OAuthUser.create({ email: 'test@example.com' });
      expect(created.email).toBe('test@example.com');
      expect(created.id).toBeDefined();
    });

    it('should execute default mock functions for OAuthService', async () => {
      const googleProfile = await OAuthService.exchangeGoogleCode('valid_code');
      expect(googleProfile.googleId).toBe('g_1029384756');

      const githubProfile = await OAuthService.exchangeGithubCode('valid_code');
      expect(githubProfile.githubId).toBe('gh_99887766');

      const jwt = OAuthService.generateJwt({ id: 'usr_123' });
      expect(jwt).toBe('mock_oauth_jwt_usr_123');
    });
  });
});