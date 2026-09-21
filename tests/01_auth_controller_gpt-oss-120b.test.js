import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import {
  signup,
  login,
  User,
  PasswordHelper,
  TokenService
} from '../dataset/01_auth_controller.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('signup controller', () => {
  test('should register a new user successfully', async () => {
    const req = {
      body: {
        email: 'test@example.com',
        password: 'securePass123',
        name: 'John Doe'
      }
    };
    const res = mockRes();

    jest.spyOn(User, 'findOne').mockResolvedValue(null);
    jest.spyOn(User, 'create').mockImplementation(async (data) => ({
      id: 'new-id',
      ...data,
      createdAt: new Date()
    }));
    jest.spyOn(PasswordHelper, 'hash').mockImplementation(async (p) => `hashed_${p}`);
    jest.spyOn(TokenService, 'generateToken').mockImplementation(() => 'mock_token');

    await signup(req, res);

    expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
    expect(PasswordHelper.hash).toHaveBeenCalledWith('securePass123');
    expect(User.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'test@example.com',
        name: 'John Doe',
        password: 'hashed_securePass123',
        role: 'user',
        isBlocked: false
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
            name: 'John Doe',
            email: 'test@example.com',
            role: 'user'
          },
          token: 'mock_token'
        }
      })
    );
  });

  test('should return 400 when required fields are missing', async () => {
    const req = { body: { email: 'a@b.c' } };
    const res = mockRes();

    await signup(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Missing required fields')
      })
    );
  });

  test('should return 400 for invalid email format', async () => {
    const req = {
      body: { email: 'invalid-email', password: '12345678', name: 'Bob' }
    };
    const res = mockRes();

    await signup(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Invalid email format' })
    );
  });

  test('should return 400 when password is too short', async () => {
    const req = {
      body: { email: 'test@ex.com', password: 'short', name: 'Bob' }
    };
    const res = mockRes();

    await signup(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Password must be at least 8 characters long'
      })
    );
  });

  test('should return 409 when email already exists', async () => {
    const req = {
      body: { email: 'existing@example.com', password: 'validPass123', name: 'Alice' }
    };
    const res = mockRes();

    jest.spyOn(User, 'findOne').mockResolvedValue({ id: 'some-id' });

    await signup(req, res);

    expect(User.findOne).toHaveBeenCalledWith({ email: 'existing@example.com' });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('already exists') })
    );
  });

  test('should return 500 on unexpected error', async () => {
    const req = {
      body: { email: 'test@ex.com', password: 'validPass123', name: 'Bob' }
    };
    const res = mockRes();

    jest.spyOn(User, 'findOne').mockRejectedValue(new Error('DB failure'));

    await signup(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Internal server error during registration',
        details: 'DB failure'
      })
    );
  });
});

describe('login controller', () => {
  test('should login successfully with correct credentials', async () => {
    const req = {
      body: { email: 'user@example.com', password: 'plainPass' }
    };
    const res = mockRes();

    const mockUser = {
      id: 'user-id',
      name: 'Jane',
      email: 'user@example.com',
      password: 'hashed_plainPass',
      role: 'user',
      isBlocked: false
    };

    jest.spyOn(User, 'findOne').mockResolvedValue(mockUser);
    jest.spyOn(PasswordHelper, 'compare').mockResolvedValue(true);
    jest.spyOn(TokenService, 'generateToken').mockImplementation(() => 'login_token');

    await login(req, res);

    expect(User.findOne).toHaveBeenCalledWith({ email: 'user@example.com' });
    expect(PasswordHelper.compare).toHaveBeenCalledWith('plainPass', 'hashed_plainPass');
    expect(TokenService.generateToken).toHaveBeenCalledWith({ id: 'user-id', role: 'user' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: 'user-id',
            name: 'Jane',
            email: 'user@example.com',
            role: 'user'
          },
          token: 'login_token'
        }
      })
    );
  });

  test('should return 400 when email or password missing', async () => {
    const req = { body: { email: 'a@b.c' } };
    const res = mockRes();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Email and password are required'
      })
    );
  });

  test('should return 401 when user not found', async () => {
    const req = { body: { email: 'missing@example.com', password: 'any' } };
    const res = mockRes();

    jest.spyOn(User, 'findOne').mockResolvedValue(null);

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Invalid email or password' })
    );
  });

  test('should return 403 when account is blocked', async () => {
    const req = { body: { email: 'blocked@example.com', password: 'any' } };
    const res = mockRes();

    const blockedUser = {
      id: 'blocked-id',
      name: 'Blocked',
      email: 'blocked@example.com',
      password: 'hashed_any',
      role: 'user',
      isBlocked: true
    };

    jest.spyOn(User, 'findOne').mockResolvedValue(blockedUser);

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Account has been suspended' })
    );
  });

  test('should return 401 when password does not match', async () => {
    const req = { body: { email: 'user@example.com', password: 'wrong' } };
    const res = mockRes();

    const mockUser = {
      id: 'id1',
      name: 'User',
      email: 'user@example.com',
      password: 'hashed_correct',
      role: 'user',
      isBlocked: false
    };

    jest.spyOn(User, 'findOne').mockResolvedValue(mockUser);
    jest.spyOn(PasswordHelper, 'compare').mockResolvedValue(false);

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Invalid email or password' })
    );
  });

  test('should return 500 on unexpected error', async () => {
    const req = { body: { email: 'any@example.com', password: 'any' } };
    const res = mockRes();

    jest.spyOn(User, 'findOne').mockRejectedValue(new Error('DB issue'));

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Internal server error during login',
        details: 'DB issue'
      })
    );
  });
});