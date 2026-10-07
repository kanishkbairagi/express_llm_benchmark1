import { jest } from '@jest/globals';

// Mock environment configuration
jest.mock('../dataset/external/dimartarmizi__OmniCloud/backend/src/config/env.js', () => ({
  env: {
    authCookieName: 'auth_token',
    appMode: 'local',
  },
}));

// Mock auth service functions
const mockClearUserSessions = jest.fn();
const mockCreateSession = jest.fn();
const mockDestroySession = jest.fn();
const mockGetAuthSummary = jest.fn();
const mockLoginHostedUser = jest.fn();
const mockRegisterHostedUser = jest.fn();

jest.mock('../dataset/external/dimartarmizi__OmniCloud/backend/src/services/authService.js', () => ({
  clearUserSessions: mockClearUserSessions,
  createSession: mockCreateSession,
  destroySession: mockDestroySession,
  getAuthSummary: mockGetAuthSummary,
  loginHostedUser: mockLoginHostedUser,
  registerHostedUser: mockRegisterHostedUser,
}));

// Mock Express Router to capture route handlers
const routes = { get: {}, post: {} };
const mockRouter = {
  get: jest.fn((path, handler) => {
    routes.get[path] = handler;
    return mockRouter;
  }),
  post: jest.fn((path, handler) => {
    routes.post[path] = handler;
    return mockRouter;
  }),
};

jest.mock('express', () => ({
  Router: jest.fn(() => mockRouter),
}));

// Import the router after all mocks are in place
import router from '../dataset/external/dimartarmizi__OmniCloud/backend/src/routes/authRoutes.js';

describe('authRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset env defaults for each test
    const { env } = await import('../dataset/external/dimartarmizi__OmniCloud/backend/src/config/env.js');
    env.authCookieName = 'auth_token';
    env.appMode = 'local';
  });

  describe('POST /auth/register', () => {
    it('should register user, set cookie and respond with 201', async () => {
      const fakeUser = { id: 'user-123', name: 'Alice' };
      const fakeSession = { token: 'session-token' };
      const summary = { id: 'user-123', name: 'Alice' };

      mockRegisterHostedUser.mockReturnValue(fakeUser);
      mockCreateSession.mockReturnValue(fakeSession);
      mockGetAuthSummary.mockReturnValue(summary);

      const req = { body: { email: 'a@example.com', password: 'pwd' } };
      const res = {
        locals: { authCookieOptions: { httpOnly: true } },
        cookie: jest.fn(),
        status: jest.fn(() => res),
        json: jest.fn(),
      };
      const next = jest.fn();

      await routes.post['/auth/register'](req, res, next);

      expect(mockRegisterHostedUser).toHaveBeenCalledWith(req.body);
      expect(mockClearUserSessions).toHaveBeenCalledWith(fakeUser.id);
      expect(mockCreateSession).toHaveBeenCalledWith(fakeUser.id);
      expect(res.cookie).toHaveBeenCalledWith('auth_token', fakeSession.token, { httpOnly: true });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ data: summary });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/login', () => {
    it('should login user, set cookie and respond with user summary', async () => {
      const fakeUser = { id: 'user-456', name: 'Bob' };
      const fakeSession = { token: 'login-token' };
      const summary = { id: 'user-456', name: 'Bob' };

      mockLoginHostedUser.mockReturnValue(fakeUser);
      mockCreateSession.mockReturnValue(fakeSession);
      mockGetAuthSummary.mockReturnValue(summary);

      const req = { body: { email: 'b@example.com', password: 'pwd' } };
      const res = {
        locals: { authCookieOptions: {} },
        cookie: jest.fn(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await routes.post['/auth/login'](req, res, next);

      expect(mockLoginHostedUser).toHaveBeenCalledWith(req.body);
      expect(mockCreateSession).toHaveBeenCalledWith(fakeUser.id);
      expect(res.cookie).toHaveBeenCalledWith('auth_token', fakeSession.token, {});
      expect(res.json).toHaveBeenCalledWith({ data: summary });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('GET /auth/me', () => {
    it('should respond with auth summary of req.user', async () => {
      const summary = { id: 'user-789', name: 'Carol' };
      mockGetAuthSummary.mockReturnValue(summary);

      const req = { user: { id: 'user-789', name: 'Carol' } };
      const res = { json: jest.fn() };

      await routes.get['/auth/me'](req, res);

      expect(mockGetAuthSummary).toHaveBeenCalledWith(req.user);
      expect(res.json).toHaveBeenCalledWith({ data: summary });
    });
  });

  describe('POST /auth/logout', () => {
    it('should destroy session when token present, clear cookie, and respond with summary (local mode)', async () => {
      const req = {
        headers: { cookie: 'auth_token=encoded%20token; other=val' },
        user: { id: 'user-999', name: 'Dave' },
      };
      const res = {
        clearCookie: jest.fn(),
        json: jest.fn(),
      };
      const decodedToken = 'encoded token';
      const summary = { id: 'user-999', name: 'Dave' };

      mockGetAuthSummary.mockReturnValue(summary);

      await routes.post['/auth/logout'](req, res);

      expect(mockDestroySession).toHaveBeenCalledWith(decodedToken);
      expect(res.clearCookie).toHaveBeenCalledWith('auth_token', expect.objectContaining({ maxAge: 0 }));
      expect(mockGetAuthSummary).toHaveBeenCalledWith(req.user);
      expect(res.json).toHaveBeenCalledWith({ data: summary });
    });

    it('should not destroy session when token missing, clear cookie, and return null summary (non‑local mode)', async () => {
      const { env } = await import('../dataset/external/dimartarmizi__OmniCloud/backend/src/config/env.js');
      env.appMode = 'production';

      const req = { headers: { cookie: '' }, user: { id: 'user-111' } };
      const res = {
        clearCookie: jest.fn(),
        json: jest.fn(),
      };
      mockGetAuthSummary.mockReturnValue(null);

      await routes.post['/auth/logout'](req, res);

      expect(mockDestroySession).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledWith('auth_token', expect.objectContaining({ maxAge: 0 }));
      expect(mockGetAuthSummary).toHaveBeenCalledWith(null);
      expect(res.json).toHaveBeenCalledWith({ data: null });
    });
  });
});