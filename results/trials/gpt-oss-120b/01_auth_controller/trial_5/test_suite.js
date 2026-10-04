import { jest } from '@jest/globals';
import {
  signup,
  login,
  User,
  PasswordHelper,
  TokenService
} from '../dataset/01_auth_controller.js';

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('signup controller', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should register a new user successfully', async () => {
    const req = {
      body: {
        email: 'test@example.com',
        password: 'securePass123',
        name: 'Test User'
      }
    };
    const res = mockResponse();

    jest.spyOn(User, 'findOne').mockResolvedValue(null);
    jest.spyOn(PasswordHelper, 'hash').mockResolvedValue('hashed_securePass123');
    jest.spyOn(User, 'create').mockResolvedValue({
      id: 'new-id',
      name: 'Test User',
      email: 'test@example.com',
      role: 'user',
      password: 'hashed_securePass123'
    });
    jest.spyOn(TokenService, 'generateToken').mockReturnValue('mock_jwt_token_new-id');

    await signup(req, res);

    expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
    expect(PasswordHelper.hash).toHaveBeenCalledWith('securePass123');
    expect(User.create).toHaveBeenCalledWith({
      name: 'Test User',
      email: 'test@example.com',
      password: 'hashed_securePass123',
      role: 'user',
      isBlocked: false
    });
    expect(TokenService.generateToken).toHaveBeenCalledWith({ id: 'new-id', role: 'user' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: 'new-id',
          name: 'Test User',
          email: 'test@example.com',
          role: 'user'
        },
        token: 'mock_jwt_token_new-id'
      }
    });
  });

  test('should return 400 when required fields are missing', async () => {
    const req = { body: { email: 'a@b.com' } };
    const res = mockResponse();

    await signup(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Missing required fields: email, password, and name are required'
    });
  });

  test('should return 400 for invalid email format', async () => {
    const req = { body: { email: 'invalid-email', password: '12345678', name: 'Bob' } };
    const res = mockResponse();

    await signup(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid email format'
    });
  });

  test('should return 400 for short password', async () => {
    const req = { body: { email: 'bob@example.com', password: 'short', name: 'Bob' } };
    const res = mockResponse();

    await signup(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Password must be at least 8 characters long'
    });
  });

  test('should return 409 when email already exists', async () => {
    const req = { body: { email: 'dup@example.com', password: 'validPass123', name: 'Dup' } };
    const res = mockResponse();

    jest.spyOn(User, 'findOne').mockResolvedValue({ id: 'existing' });

    await signup(req, res);

    expect(User.findOne).toHaveBeenCalledWith({ email: 'dup@example.com' });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'An account with this email already exists'
    });
  });

  test('should return 500 on internal error', async () => {
    const req = { body: { email: 'err@example.com', password: 'validPass123', name: 'Err' } };
    const res = mockResponse();

    jest.spyOn(User, 'findOne').mockResolvedValue(null);
    jest.spyOn(PasswordHelper, 'hash').mockRejectedValue(new Error('hash failed'));

    await signup(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Internal server error during registration',
      details: 'hash failed'
    });
  });
});

describe('login controller', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should login successfully with correct credentials', async () => {
    const req = { body: { email: 'login@example.com', password: 'plainPass' } };
    const res = mockResponse();

    const mockUser = {
      id: 'user-id',
      name: 'Login User',
      email: 'login@example.com',
      role: 'user',
      password: 'hashed_plainPass',
      isBlocked: false
    };

    jest.spyOn(User, 'findOne').mockResolvedValue(mockUser);
    jest.spyOn(PasswordHelper, 'compare').mockResolvedValue(true);
    jest.spyOn(TokenService, 'generateToken').mockReturnValue('mock_jwt_token_user-id');

    await login(req, res);

    expect(User.findOne).toHaveBeenCalledWith({ email: 'login@example.com' });
    expect(PasswordHelper.compare).toHaveBeenCalledWith('plainPass', 'hashed_plainPass');
    expect(TokenService.generateToken).toHaveBeenCalledWith({ id: 'user-id', role: 'user' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: 'user-id',
          name: 'Login User',
          email: 'login@example.com',
          role: 'user'
        },
        token: 'mock_jwt_token_user-id'
      }
    });
  });

  test('should return 400 when email or password is missing', async () => {
    const req = { body: { email: 'only@example.com' } };
    const res = mockResponse();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Email and password are required'
    });
  });

  test('should return 401 when user not found', async () => {
    const req = { body: { email: 'unknown@example.com', password: 'any' } };
    const res = mockResponse();

    jest.spyOn(User, 'findOne').mockResolvedValue(null);

    await login(req, res);

    expect(User.findOne).toHaveBeenCalledWith({ email: 'unknown@example.com' });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid email or password'
    });
  });

  test('should return 403 when account is blocked', async () => {
    const req = { body: { email: 'blocked@example.com', password: 'any' } };
    const res = mockResponse();

    const blockedUser = {
      id: 'blocked-id',
      name: 'Blocked',
      email: 'blocked@example.com',
      role: 'user',
      password: 'hashed_any',
      isBlocked: true
    };

    jest.spyOn(User, 'findOne').mockResolvedValue(blockedUser);

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Account has been suspended'
    });
  });

  test('should return 401 when password does not match', async () => {
    const req = { body: { email: 'mismatch@example.com', password: 'wrong' } };
    const res = mockResponse();

    const user = {
      id: 'uid',
      name: 'User',
      email: 'mismatch@example.com',
      role: 'user',
      password: 'hashed_correct',
      isBlocked: false
    };

    jest.spyOn(User, 'findOne').mockResolvedValue(user);
    jest.spyOn(PasswordHelper, 'compare').mockResolvedValue(false);

    await login(req, res);

    expect(PasswordHelper.compare).toHaveBeenCalledWith('wrong', 'hashed_correct');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid email or password'
    });
  });

  test('should return 500 on internal error', async () => {
    const req = { body: { email: 'err@example.com', password: 'any' } };
    const res = mockResponse();

    jest.spyOn(User, 'findOne').mockRejectedValue(new Error('db failure'));

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Internal server error during login',
      details: 'db failure'
    });
  });
});