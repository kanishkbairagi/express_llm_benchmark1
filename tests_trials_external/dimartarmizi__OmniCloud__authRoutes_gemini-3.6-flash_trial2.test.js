import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

jest.mock('../config/env.js', () => ({
  env: {
    authCookieName: 'omni_auth_token',
    appMode: 'hosted',
  },
}));

jest.mock('../services/authService.js', () => ({
  clearUserSessions: jest.fn(),
  createSession: jest.fn(),
  destroySession: jest.fn(),
  getAuthSummary: jest.fn(),
  loginHostedUser: jest.fn(),
  registerHostedUser: jest.fn(),
}));

import { env } from '../config/env.js';
import {
  clearUserSessions,
  createSession,
  destroySession,
  getAuthSummary,
  loginHostedUser,
  registerHostedUser,
} from '../services/authService.js';
import router from '../dataset/external/dimartarmizi__OmniCloud/backend/src/routes/authRoutes.js';

describe('Auth Routes', () => {
  let app;

  const buildApp = (customMiddleware) => {
    const instance = express();
    instance.use(express.json());
    if (customMiddleware) {
      instance.use(customMiddleware);
    }
    instance.use(router);
    instance.use((err, req, res, next) => {
      res.status(err.status || 500).json({ error: err.message });
    });
    return instance;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    env.appMode = 'hosted';
    env.authCookieName = 'omni_auth_token';
    app = buildApp();
  });

  describe('GET /auth/me', () => {
    it('should return auth summary for current user', async () => {
      const mockUser = { id: 'u1', email: 'test@example.com' };
      const summary = { id: 'u1', email: 'test@example.com', isAuthenticated: true };
      getAuthSummary.mockReturnValue(summary);

      const appWithUser = buildApp((req, res, next) => {
        req.user = mockUser;
        next();
      });

      const res = await request(appWithUser).get('/auth/me');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: summary });
      expect(getAuthSummary).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('POST /auth/register', () => {
    it('should register user, clear existing sessions, create session, set cookie, and return 201', async () => {
      const registerData = { email: 'new@example.com', password: 'password123' };
      const createdUser = { id: 'user-123', email: 'new@example.com' };
      const session = { token: 'session-token-xyz' };
      const summary = { id: 'user-123', email: 'new@example.com' };

      registerHostedUser.mockReturnValue(createdUser);
      createSession.mockReturnValue(session);
      getAuthSummary.mockReturnValue(summary);

      const res = await request(app).post('/auth/register').send(registerData);

      expect(res.status).toBe(201);
      expect(registerHostedUser).toHaveBeenCalledWith(registerData);
      expect(clearUserSessions).toHaveBeenCalledWith('user-123');
      expect(createSession).toHaveBeenCalledWith('user-123');
      expect(getAuthSummary).toHaveBeenCalledWith(createdUser);
      expect(res.body).toEqual({ data: summary });
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toContain('omni_auth_token=session-token-xyz');
    });

    it('should use custom authCookieOptions if provided in res.locals', async () => {
      const createdUser = { id: 'user-123' };
      registerHostedUser.mockReturnValue(createdUser);
      createSession.mockReturnValue({ token: 'tok' });
      getAuthSummary.mockReturnValue({ id: 'user-123' });

      const appWithCookieOptions = buildApp((req, res, next) => {
        res.locals.authCookieOptions = { httpOnly: true, secure: true };
        next();
      });

      const res = await request(appWithCookieOptions).post('/auth/register').send({});

      expect(res.status).toBe(201);
      expect(res.headers['set-cookie'][0]).toContain('HttpOnly');
      expect(res.headers['set-cookie'][0]).toContain('Secure');
    });

    it('should pass error to next middleware if registration fails', async () => {
      const error = new Error('User already exists');
      error.status = 400;
      registerHostedUser.mockImplementation(() => {
        throw error;
      });

      const res = await request(app).post('/auth/register').send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'User already exists' });
    });
  });

  describe('POST /auth/login', () => {
    it('should authenticate user, create session, set cookie, and return 200', async () => {
      const loginData = { email: 'user@example.com', password: 'password123' };
      const user = { id: 'user-456', email: 'user@example.com' };
      const session = { token: 'login-token-789' };
      const summary = { id: 'user-456', email: 'user@example.com' };

      loginHostedUser.mockReturnValue(user);
      createSession.mockReturnValue(session);
      getAuthSummary.mockReturnValue(summary);

      const res = await request(app).post('/auth/login').send(loginData);

      expect(res.status).toBe(200);
      expect(loginHostedUser).toHaveBeenCalledWith(loginData);
      expect(createSession).toHaveBeenCalledWith('user-456');
      expect(getAuthSummary).toHaveBeenCalledWith(user);
      expect(res.body).toEqual({ data: summary });
      expect(res.headers['set-cookie'][0]).toContain('omni_auth_token=login-token-789');
    });

    it('should pass error to next middleware if login fails', async () => {
      const error = new Error('Invalid credentials');
      error.status = 401;
      loginHostedUser.mockImplementation(() => {
        throw error;
      });

      const res = await request(app).post('/auth/login').send({});

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Invalid credentials' });
    });
  });

  describe('POST /auth/logout', () => {
    it('should destroy session if cookie is present, clear cookie, and return auth summary', async () => {
      const token = 'token%20to%20destroy';
      getAuthSummary.mockReturnValue({ isAuthenticated: false });

      const res = await request(app)
        .post('/auth/logout')
        .set('Cookie', [`omni_auth_token=${token}`, 'other_cookie=123']);

      expect(destroySession).toHaveBeenCalledWith('token to destroy');
      expect(getAuthSummary).toHaveBeenCalledWith(null);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: { isAuthenticated: false } });
    });

    it('should not call destroySession if cookie is missing', async () => {
      getAuthSummary.mockReturnValue({ isAuthenticated: false });

      const res = await request(app).post('/auth/logout');

      expect(destroySession).not.toHaveBeenCalled();
      expect(getAuthSummary).toHaveBeenCalledWith(null);
      expect(res.status).toBe(200);
    });

    it('should pass req.user to getAuthSummary when env.appMode is local', async () => {
      env.appMode = 'local';
      const mockUser = { id: 'local-user' };
      getAuthSummary.mockReturnValue({ id: 'local-user', mode: 'local' });

      const appWithUser = buildApp((req, res, next) => {
        req.user = mockUser;
        next();
      });

      const res = await request(appWithUser).post('/auth/logout');

      expect(getAuthSummary).toHaveBeenCalledWith(mockUser);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: { id: 'local-user', mode: 'local' } });
    });
  });
});