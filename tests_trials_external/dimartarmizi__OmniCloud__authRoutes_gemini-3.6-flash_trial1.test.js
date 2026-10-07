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

import router from '../dataset/external/dimartarmizi__OmniCloud/backend/src/routes/authRoutes.js';
import { env } from '../config/env.js';
import {
	clearUserSessions,
	createSession,
	destroySession,
	getAuthSummary,
	loginHostedUser,
	registerHostedUser,
} from '../services/authService.js';

describe('authRoutes', () => {
	let app;

	beforeEach(() => {
		jest.clearAllMocks();
		env.appMode = 'hosted';
		env.authCookieName = 'omni_auth_token';

		app = express();
		app.use(express.json());

		// Test middleware to inject req.user or res.locals if needed
		app.use((req, res, next) => {
			if (req.headers['x-user']) {
				req.user = JSON.parse(req.headers['x-user']);
			}
			if (req.headers['x-cookie-options']) {
				res.locals.authCookieOptions = JSON.parse(req.headers['x-cookie-options']);
			}
			next();
		});

		app.use('/', router);

		// Error handler for route errors
		app.use((err, req, res, next) => {
			res.status(err.status || 500).json({ error: err.message });
		});
	});

	describe('GET /auth/me', () => {
		it('should return auth summary for current user', async () => {
			const mockUser = { id: 'u1', username: 'testuser' };
			const mockSummary = { id: 'u1', name: 'testuser', authenticated: true };

			getAuthSummary.mockReturnValue(mockSummary);

			const res = await request(app)
				.get('/auth/me')
				.set('x-user', JSON.stringify(mockUser));

			expect(res.status).toBe(200);
			expect(getAuthSummary).toHaveBeenCalledWith(mockUser);
			expect(res.body).toEqual({ data: mockSummary });
		});

		it('should return auth summary when user is undefined', async () => {
			getAuthSummary.mockReturnValue(null);

			const res = await request(app).get('/auth/me');

			expect(res.status).toBe(200);
			expect(getAuthSummary).toHaveBeenCalledWith(undefined);
			expect(res.body).toEqual({ data: null });
		});
	});

	describe('POST /auth/register', () => {
		it('should register a new user, create session, set cookie, and return 201 with summary', async () => {
			const registerData = { username: 'newuser', password: 'password123' };
			const registeredUser = { id: 'user_123', username: 'newuser' };
			const sessionData = { token: 'session_token_xyz' };
			const userSummary = { id: 'user_123', username: 'newuser' };

			registerHostedUser.mockReturnValue(registeredUser);
			createSession.mockReturnValue(sessionData);
			getAuthSummary.mockReturnValue(userSummary);

			const res = await request(app)
				.post('/auth/register')
				.send(registerData);

			expect(res.status).toBe(201);
			expect(registerHostedUser).toHaveBeenCalledWith(registerData);
			expect(clearUserSessions).toHaveBeenCalledWith('user_123');
			expect(createSession).toHaveBeenCalledWith('user_123');
			expect(getAuthSummary).toHaveBeenCalledWith(registeredUser);

			const setCookieHeader = res.headers['set-cookie'][0];
			expect(setCookieHeader).toContain('omni_auth_token=session_token_xyz');
			expect(res.body).toEqual({ data: userSummary });
		});

		it('should use custom cookie options from res.locals if present', async () => {
			const registeredUser = { id: 'user_123' };
			registerHostedUser.mockReturnValue(registeredUser);
			createSession.mockReturnValue({ token: 'token123' });

			const cookieOptions = { httpOnly: true, sameSite: 'strict' };

			const res = await request(app)
				.post('/auth/register')
				.set('x-cookie-options', JSON.stringify(cookieOptions))
				.send({});

			expect(res.status).toBe(201);
			const setCookieHeader = res.headers['set-cookie'][0];
			expect(setCookieHeader).toContain('HttpOnly');
			expect(setCookieHeader).toContain('SameSite=Strict');
		});

		it('should pass errors to next error handler when registration fails', async () => {
			registerHostedUser.mockImplementation(() => {
				const error = new Error('Username already taken');
				error.status = 400;
				throw error;
			});

			const res = await request(app)
				.post('/auth/register')
				.send({ username: 'existing' });

			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'Username already taken' });
		});
	});

	describe('POST /auth/login', () => {
		it('should login user, create session, set cookie, and return summary', async () => {
			const loginCredentials = { username: 'user1', password: 'password' };
			const user = { id: 'u_1' };
			const session = { token: 'login_token_123' };
			const summary = { id: 'u_1', loggedIn: true };

			loginHostedUser.mockReturnValue(user);
			createSession.mockReturnValue(session);
			getAuthSummary.mockReturnValue(summary);

			const res = await request(app)
				.post('/auth/login')
				.send(loginCredentials);

			expect(res.status).toBe(200);
			expect(loginHostedUser).toHaveBeenCalledWith(loginCredentials);
			expect(createSession).toHaveBeenCalledWith('u_1');
			expect(getAuthSummary).toHaveBeenCalledWith(user);

			const setCookieHeader = res.headers['set-cookie'][0];
			expect(setCookieHeader).toContain('omni_auth_token=login_token_123');
			expect(res.body).toEqual({ data: summary });
		});

		it('should pass error to next handler when login credentials are invalid', async () => {
			loginHostedUser.mockImplementation(() => {
				const error = new Error('Invalid credentials');
				error.status = 401;
				throw error;
			});

			const res = await request(app)
				.post('/auth/login')
				.send({ username: 'user1', password: 'wrong' });

			expect(res.status).toBe(401);
			expect(res.body).toEqual({ error: 'Invalid credentials' });
		});
	});

	describe('POST /auth/logout', () => {
		it('should destroy session and clear cookie when auth cookie is present', async () => {
			const token = 'active_token_123';
			getAuthSummary.mockReturnValue(null);

			const res = await request(app)
				.post('/auth/logout')
				.set('Cookie', [`other_cookie=abc`, `${env.authCookieName}=${encodeURIComponent(token)}`]);

			expect(res.status).toBe(200);
			expect(destroySession).toHaveBeenCalledWith(token);

			const setCookieHeader = res.headers['set-cookie'][0];
			expect(setCookieHeader).toContain('omni_auth_token=;');
			expect(getAuthSummary).toHaveBeenCalledWith(null);
			expect(res.body).toEqual({ data: null });
		});

		it('should clear cookie without calling destroySession when auth cookie is missing', async () => {
			getAuthSummary.mockReturnValue(null);

			const res = await request(app)
				.post('/auth/logout')
				.set('Cookie', ['other_cookie=xyz']);

			expect(res.status).toBe(200);
			expect(destroySession).not.toHaveBeenCalled();

			const setCookieHeader = res.headers['set-cookie'][0];
			expect(setCookieHeader).toContain('omni_auth_token=;');
		});

		it('should pass req.user to getAuthSummary when appMode is local', async () => {
			env.appMode = 'local';
			const mockUser = { id: 'local_user' };
			const mockSummary = { id: 'local_user', isLocal: true };
			getAuthSummary.mockReturnValue(mockSummary);

			const res = await request(app)
				.post('/auth/logout')
				.set('x-user', JSON.stringify(mockUser));

			expect(res.status).toBe(200);
			expect(getAuthSummary).toHaveBeenCalledWith(mockUser);
			expect(res.body).toEqual({ data: mockSummary });
		});

		it('should pass null to getAuthSummary when appMode is hosted', async () => {
			env.appMode = 'hosted';
			const mockUser = { id: 'hosted_user' };
			getAuthSummary.mockReturnValue(null);

			const res = await request(app)
				.post('/auth/logout')
				.set('x-user', JSON.stringify(mockUser));

			expect(res.status).toBe(200);
			expect(getAuthSummary).toHaveBeenCalledWith(null);
			expect(res.body).toEqual({ data: null });
		});
	});
});