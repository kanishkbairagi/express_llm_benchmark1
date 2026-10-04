import { jest } from '@jest/globals';
import {
  signup,
  login,
  User,
  PasswordHelper,
  TokenService,
} from '../dataset/01_auth_controller.js';

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('signup controller', () => {
  test('returns 400 when required fields are missing', async () => {
    const req = { body: { email: 'test@example.com' } };
    const res = mockResponse();

    await signup(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Missing required fields'),
      })
    );
  });

  test('returns 400 for invalid email format', async () => {
    const req = { body: { email: 'invalid-email', password: 'password123', name: 'John' } };
    const res = mockResponse();

    await signup(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Invalid email format',
      })
    );
  });

  test('returns 400 when password is too short', async () => {
    const req = { body: { email: 'test@example.com', password: 'short', name: 'John' } };
    const res = mockResponse();

    await signup(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Password must be at least 8 characters long',
      })
    );
  });

  test('returns 409 when email already exists', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ id: 'existing' });

    const req = {
      body: { email: 'test@example.com', password: 'password123', name: 'John' },
    };
    const res = mockResponse();

    await signup(req, res);

    expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'An account with this email already exists',
      })
    );
  });

  test('creates a new user and returns 201 with token on success', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue(null);
    jest.spyOn(User, 'create').mockImplementation(async (data) => ({
      id: 'new-id',
      ...data,
    }));
    jest.spyOn(PasswordHelper, 'hash').mockImplementation(async (pw) => `hashed_${pw}`);
    jest.spyOn(TokenService, 'generateToken').mockImplementation(({ id }) => `token-${id}`);

    const req = {
      body: { email: 'new@example.com', password: 'strongPass123', name: ' Alice ' },
    };
    const res = mockResponse();

    await signup(req, res);

    expect(PasswordHelper.hash).toHaveBeenCalledWith('strongPass123');
    expect(User.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Alice',
        email: 'new@example.com',
        password: 'hashed_strongPass123',
        role: 'user',
        isBlocked: false,
      })
    );
    expect(TokenService.generateToken).toHaveBeenCalledWith({ id: 'new-id', role: 'user' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'User registered successfully',
        data: {
          user: {
            id: 'new-id',
            name: 'Alice',
            email: 'new@example.com',
            role: 'user',
          },
          token: 'token-new-id',
        },
      })
    );
  });
});

describe('login controller', () => {
  test('returns 400 when email or password missing', async () => {
    const req = { body: { email: 'test@example.com' } };
    const res = mockResponse();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Email and password are required',
      })
    );
  });

  test('returns 401 when user not found', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue(null);

    const req = { body: { email: 'unknown@example.com', password: 'any' } };
    const res = mockResponse();

    await login(req, res);

    expect(User.findOne).toHaveBeenCalledWith({ email: 'unknown@example.com' });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Invalid email or password',
      })
    );
  });

  test('returns 403 when account is blocked', async () => {
    const blockedUser = {
      id: 'blocked-id',
      email: 'blocked@example.com',
      password: 'hashed_pass',
      isBlocked: true,
      role: 'user',
      name: 'Blocked',
    };
    jest.spyOn(User, 'findOne').mockResolvedValue(blockedUser);

    const req = { body: { email: 'blocked@example.com', password: 'any' } };
    const res = mockResponse();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Account has been suspended',
      })
    );
  });

  test('returns 401 when password does not match', async () => {
    const user = {
      id: 'user-id',
      email: 'user@example.com',
      password: 'hashed_correct',
      isBlocked: false,
      role: 'user',
      name: 'User',
    };
    jest.spyOn(User, 'findOne').mockResolvedValue(user);
    jest.spyOn(PasswordHelper, 'compare').mockResolvedValue(false);

    const req = { body: { email: 'user@example.com', password: 'wrongpass' } };
    const res = mockResponse();

    await login(req, res);

    expect(PasswordHelper.compare).toHaveBeenCalledWith('wrongpass', 'hashed_correct');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Invalid email or password',
      })
    );
  });

  test('returns 200 with token on successful login', async () => {
    const user = {
      id: 'login-id',
      email: 'login@example.com',
      password: 'hashed_pass123',
      isBlocked: false,
      role: 'admin',
      name: 'LoginUser',
    };
    jest.spyOn(User, 'findOne').mockResolvedValue(user);
    jest.spyOn(PasswordHelper, 'compare').mockResolvedValue(true);
    jest.spyOn(TokenService, 'generateToken').mockImplementation(({ id }) => `jwt-${id}`);

    const req = { body: { email: 'login@example.com', password: 'pass123' } };
    const res = mockResponse();

    await login(req, res);

    expect(PasswordHelper.compare).toHaveBeenCalledWith('pass123', 'hashed_pass123');
    expect(TokenService.generateToken).toHaveBeenCalledWith({ id: 'login-id', role: 'admin' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: 'login-id',
            name: 'LoginUser',
            email: 'login@example.com',
            role: 'admin',
          },
          token: 'jwt-login-id',
        },
      })
    );
  });
});