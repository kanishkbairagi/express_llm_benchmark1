import { jest } from '@jest/globals';
import { signup, login, User, PasswordHelper, TokenService } from '../dataset/01_auth_controller.js';

describe('Auth Controller', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      body: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  describe('signup', () => {
    test('should return 400 if required fields are missing', async () => {
      req.body = { email: 'test@example.com', password: 'password123' }; // missing name

      await signup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing required fields: email, password, and name are required'
      });
    });

    test('should return 400 if email format is invalid', async () => {
      req.body = { email: 'invalid-email', password: 'password123', name: 'John Doe' };

      await signup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid email format'
      });
    });

    test('should return 400 if password is less than 8 characters', async () => {
      req.body = { email: 'test@example.com', password: 'short', name: 'John Doe' };

      await signup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Password must be at least 8 characters long'
      });
    });

    test('should return 400 if password is not a string', async () => {
      req.body = { email: 'test@example.com', password: 12345678, name: 'John Doe' };

      await signup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Password must be at least 8 characters long'
      });
    });

    test('should return 409 if user email already exists', async () => {
      req.body = { email: 'existing@example.com', password: 'password123', name: 'John Doe' };
      jest.spyOn(User, 'findOne').mockResolvedValue({ id: 'existing-id', email: 'existing@example.com' });

      await signup(req, res);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'existing@example.com' });
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'An account with this email already exists'
      });
    });

    test('should successfully register user and return 201', async () => {
      req.body = { email: 'new@example.com', password: 'password123', name: '  John Doe  ' };
      jest.spyOn(User, 'findOne').mockResolvedValue(null);
      jest.spyOn(PasswordHelper, 'hash').mockResolvedValue('hashed_password123');
      jest.spyOn(User, 'create').mockResolvedValue({
        id: 'new-user-id',
        name: 'John Doe',
        email: 'new@example.com',
        role: 'user',
        isBlocked: false
      });
      jest.spyOn(TokenService, 'generateToken').mockReturnValue('mock_jwt_token_new-user-id');

      await signup(req, res);

      expect(PasswordHelper.hash).toHaveBeenCalledWith('password123');
      expect(User.create).toHaveBeenCalledWith({
        name: 'John Doe',
        email: 'new@example.com',
        password: 'hashed_password123',
        role: 'user',
        isBlocked: false
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'User registered successfully',
        data: {
          user: {
            id: 'new-user-id',
            name: 'John Doe',
            email: 'new@example.com',
            role: 'user'
          },
          token: 'mock_jwt_token_new-user-id'
        }
      });
    });

    test('should handle internal errors and return 500', async () => {
      req.body = { email: 'error@example.com', password: 'password123', name: 'John Doe' };
      jest.spyOn(User, 'findOne').mockRejectedValue(new Error('Database error'));

      await signup(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error during registration',
        details: 'Database error'
      });
    });
  });

  describe('login', () => {
    test('should return 400 if email or password is missing', async () => {
      req.body = { email: 'test@example.com' };

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Email and password are required'
      });
    });

    test('should return 401 if user is not found', async () => {
      req.body = { email: 'notfound@example.com', password: 'password123' };
      jest.spyOn(User, 'findOne').mockResolvedValue(null);

      await login(req, res);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'notfound@example.com' });
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid email or password'
      });
    });

    test('should return 403 if user account is blocked', async () => {
      req.body = { email: 'blocked@example.com', password: 'password123' };
      jest.spyOn(User, 'findOne').mockResolvedValue({
        id: 'blocked-id',
        email: 'blocked@example.com',
        isBlocked: true
      });

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Account has been suspended'
      });
    });

    test('should return 401 if password does not match', async () => {
      req.body = { email: 'user@example.com', password: 'wrongpassword' };
      jest.spyOn(User, 'findOne').mockResolvedValue({
        id: 'user-id',
        email: 'user@example.com',
        password: 'hashed_correctpassword',
        isBlocked: false
      });
      jest.spyOn(PasswordHelper, 'compare').mockResolvedValue(false);

      await login(req, res);

      expect(PasswordHelper.compare).toHaveBeenCalledWith('wrongpassword', 'hashed_correctpassword');
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid email or password'
      });
    });

    test('should return 200 and token on successful login', async () => {
      req.body = { email: 'user@example.com', password: 'correctpassword' };
      const mockUser = {
        id: 'user-id',
        name: 'John Doe',
        email: 'user@example.com',
        password: 'hashed_correctpassword',
        role: 'user',
        isBlocked: false
      };
      jest.spyOn(User, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(PasswordHelper, 'compare').mockResolvedValue(true);
      jest.spyOn(TokenService, 'generateToken').mockReturnValue('mock_jwt_token_user-id');

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: 'user-id',
            name: 'John Doe',
            email: 'user@example.com',
            role: 'user'
          },
          token: 'mock_jwt_token_user-id'
        }
      });
    });

    test('should handle internal errors and return 500', async () => {
      req.body = { email: 'error@example.com', password: 'password123' };
      jest.spyOn(User, 'findOne').mockRejectedValue(new Error('Unexpected DB error'));

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error during login',
        details: 'Unexpected DB error'
      });
    });
  });
});