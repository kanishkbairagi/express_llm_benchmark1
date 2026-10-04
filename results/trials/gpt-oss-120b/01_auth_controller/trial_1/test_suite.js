import { jest } from '@jest/globals';
import {
  signup,
  login,
  User,
  PasswordHelper,
  TokenService
} from '../dataset/01_auth_controller.js';

describe('Auth Controller', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('signup', () => {
    test('should register a new user successfully', async () => {
      const req = {
        body: {
          email: 'test@example.com',
          password: 'StrongPass123',
          name: ' Test User '
        }
      };
      const res = mockRes();

      jest.spyOn(User, 'findOne').mockResolvedValue(null);
      jest.spyOn(User, 'create').mockImplementation(async (data) => ({
        id: 'new-id',
        ...data
      }));
      jest.spyOn(PasswordHelper, 'hash').mockImplementation(async (p) => `hashed_${p}`);
      jest.spyOn(TokenService, 'generateToken').mockReturnValue('mocktoken');

      await signup(req, res);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(PasswordHelper.hash).toHaveBeenCalledWith('StrongPass123');
      expect(User.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashed_StrongPass123',
        role: 'user',
        isBlocked: false
      }));
      expect(TokenService.generateToken).toHaveBeenCalledWith({ id: 'new-id', role: 'user' });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: 'User registered successfully',
        data: expect.objectContaining({
          user: expect.objectContaining({
            id: 'new-id',
            name: 'Test User',
            email: 'test@example.com',
            role: 'user'
          }),
          token: 'mocktoken'
        })
      }));
    });

    test('should return 400 when required fields are missing', async () => {
      const req = { body: { email: 'a@b.c' } };
      const res = mockRes();

      await signup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.stringContaining('Missing required fields')
      }));
    });

    test('should return 400 for invalid email format', async () => {
      const req = {
        body: { email: 'invalid-email', password: '12345678', name: 'Bob' }
      };
      const res = mockRes();

      await signup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Invalid email format'
      }));
    });

    test('should return 400 for short password', async () => {
      const req = {
        body: { email: 'bob@example.com', password: 'short', name: 'Bob' }
      };
      const res = mockRes();

      await signup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.stringContaining('Password must be at least 8')
      }));
    });

    test('should return 409 when email already exists', async () => {
      const req = {
        body: { email: 'dup@example.com', password: 'Password123', name: 'Dup' }
      };
      const res = mockRes();

      jest.spyOn(User, 'findOne').mockResolvedValue({ id: 'existing' });

      await signup(req, res);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'dup@example.com' });
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.stringContaining('already exists')
      }));
    });

    test('should return 500 on unexpected error', async () => {
      const req = {
        body: { email: 'err@example.com', password: 'Password123', name: 'Err' }
      };
      const res = mockRes();

      jest.spyOn(User, 'findOne').mockImplementation(() => {
        throw new Error('DB failure');
      });

      await signup(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.stringContaining('Internal server error')
      }));
    });
  });

  describe('login', () => {
    test('should login successfully with correct credentials', async () => {
      const req = {
        body: { email: 'login@example.com', password: 'Secret123' }
      };
      const res = mockRes();

      const mockUser = {
        id: 'uid123',
        name: 'Login User',
        email: 'login@example.com',
        password: 'hashed_Secret123',
        role: 'user',
        isBlocked: false
      };

      jest.spyOn(User, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(PasswordHelper, 'compare').mockResolvedValue(true);
      jest.spyOn(TokenService, 'generateToken').mockReturnValue('logintoken');

      await login(req, res);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'login@example.com' });
      expect(PasswordHelper.compare).toHaveBeenCalledWith('Secret123', 'hashed_Secret123');
      expect(TokenService.generateToken).toHaveBeenCalledWith({ id: 'uid123', role: 'user' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: 'Login successful',
        data: expect.objectContaining({
          user: expect.objectContaining({
            id: 'uid123',
            name: 'Login User',
            email: 'login@example.com',
            role: 'user'
          }),
          token: 'logintoken'
        })
      }));
    });

    test('should return 400 when email or password missing', async () => {
      const req = { body: { email: 'only@example.com' } };
      const res = mockRes();

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.stringContaining('required')
      }));
    });

    test('should return 401 when user not found', async () => {
      const req = { body: { email: 'nope@example.com', password: 'any' } };
      const res = mockRes();

      jest.spyOn(User, 'findOne').mockResolvedValue(null);

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.stringContaining('Invalid email or password')
      }));
    });

    test('should return 403 when account is blocked', async () => {
      const req = { body: { email: 'blocked@example.com', password: 'pass1234' } };
      const res = mockRes();

      const blockedUser = {
        id: 'b1',
        name: 'Blocked',
        email: 'blocked@example.com',
        password: 'hashed_pass1234',
        role: 'user',
        isBlocked: true
      };

      jest.spyOn(User, 'findOne').mockResolvedValue(blockedUser);

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.stringContaining('suspended')
      }));
    });

    test('should return 401 when password does not match', async () => {
      const req = { body: { email: 'user@example.com', password: 'wrongpass' } };
      const res = mockRes();

      const mockUser = {
        id: 'u2',
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
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.stringContaining('Invalid email or password')
      }));
    });

    test('should return 500 on unexpected error', async () => {
      const req = { body: { email: 'error@example.com', password: 'pass1234' } };
      const res = mockRes();

      jest.spyOn(User, 'findOne').mockImplementation(() => {
        throw new Error('Unexpected');
      });

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.stringContaining('Internal server error')
      }));
    });
  });
});