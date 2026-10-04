import { jest } from '@jest/globals';
import { signup, login, User, PasswordHelper, TokenService } from '../dataset/01_auth_controller.js';

describe('01_auth_controller.js Unit Tests', () => {
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
    it('should return 400 if req.body is undefined or empty', async () => {
      req = {};

      await signup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing required fields: email, password, and name are required'
      });
    });

    it('should return 400 if required fields are missing', async () => {
      req.body = { email: 'test@example.com', password: 'password123' }; // missing name

      await signup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing required fields: email, password, and name are required'
      });
    });

    it('should return 400 if email format is invalid', async () => {
      req.body = { email: 'invalid-email', password: 'password123', name: 'John Doe' };

      await signup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid email format'
      });
    });

    it('should return 400 if password is less than 8 characters', async () => {
      req.body = { email: 'test@example.com', password: 'short', name: 'John Doe' };

      await signup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Password must be at least 8 characters long'
      });
    });

    it('should return 400 if password is not a string', async () => {
      req.body = { email: 'test@example.com', password: 12345678, name: 'John Doe' };

      await signup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Password must be at least 8 characters long'
      });
    });

    it('should return 409 if user email already exists', async () => {
      req.body = { email: 'existing@example.com', password: 'password123', name: 'John Doe' };

      jest.spyOn(User, 'findOne').mockResolvedValue({ id: 'user-1', email: 'existing@example.com' });

      await signup(req, res);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'existing@example.com' });
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'An account with this email already exists'
      });
    });

    it('should successfully register a new user and return 201 with token', async () => {
      req.body = { email: 'NewUser@example.com', password: 'password123', name: '  Jane Doe  ' };

      const mockCreatedUser = {
        id: 'new-user-id',
        name: 'Jane Doe',
        email: 'newuser@example.com',
        password: 'hashed_password123',
        role: 'user',
        isBlocked: false
      };

      jest.spyOn(User, 'findOne').mockResolvedValue(null);
      jest.spyOn(PasswordHelper, 'hash').mockResolvedValue('hashed_password123');
      jest.spyOn(User, 'create').mockResolvedValue(mockCreatedUser);
      jest.spyOn(TokenService, 'generateToken').mockReturnValue('jwt_token_123');

      await signup(req, res);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'newuser@example.com' });
      expect(PasswordHelper.hash).toHaveBeenCalledWith('password123');
      expect(User.create).toHaveBeenCalledWith({
        name: 'Jane Doe',
        email: 'newuser@example.com',
        password: 'hashed_password123',
        role: 'user',
        isBlocked: false
      });
      expect(TokenService.generateToken).toHaveBeenCalledWith({
        id: 'new-user-id',
        role: 'user'
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'User registered successfully',
        data: {
          user: {
            id: 'new-user-id',
            name: 'Jane Doe',
            email: 'newuser@example.com',
            role: 'user'
          },
          token: 'jwt_token_123'
        }
      });
    });

    it('should return 500 when an exception is thrown', async () => {
      req.body = { email: 'test@example.com', password: 'password123', name: 'John Doe' };

      jest.spyOn(User, 'findOne').mockRejectedValue(new Error('Database connection failed'));

      await signup(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error during registration',
        details: 'Database connection failed'
      });
    });
  });

  describe('login', () => {
    it('should return 400 if email or password is missing', async () => {
      req.body = { email: 'test@example.com' }; // missing password

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Email and password are required'
      });
    });

    it('should return 401 if user is not found', async () => {
      req.body = { email: 'nonexistent@example.com', password: 'password123' };

      jest.spyOn(User, 'findOne').mockResolvedValue(null);

      await login(req, res);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'nonexistent@example.com' });
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid email or password'
      });
    });

    it('should return 403 if user account is blocked', async () => {
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

    it('should return 401 if password check fails', async () => {
      req.body = { email: 'user@example.com', password: 'wrongpassword' };

      jest.spyOn(User, 'findOne').mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        password: 'hashed_password123',
        isBlocked: false
      });
      jest.spyOn(PasswordHelper, 'compare').mockResolvedValue(false);

      await login(req, res);

      expect(PasswordHelper.compare).toHaveBeenCalledWith('wrongpassword', 'hashed_password123');
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid email or password'
      });
    });

    it('should return 200 with user data and token on successful login', async () => {
      req.body = { email: 'USER@EXAMPLE.COM', password: 'correctpassword' };

      const mockUser = {
        id: 'user-123',
        name: 'John Doe',
        email: 'user@example.com',
        password: 'hashed_correctpassword',
        role: 'admin',
        isBlocked: false
      };

      jest.spyOn(User, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(PasswordHelper, 'compare').mockResolvedValue(true);
      jest.spyOn(TokenService, 'generateToken').mockReturnValue('jwt_login_token');

      await login(req, res);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'user@example.com' });
      expect(PasswordHelper.compare).toHaveBeenCalledWith('correctpassword', 'hashed_correctpassword');
      expect(TokenService.generateToken).toHaveBeenCalledWith({ id: 'user-123', role: 'admin' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: 'user-123',
            name: 'John Doe',
            email: 'user@example.com',
            role: 'admin'
          },
          token: 'jwt_login_token'
        }
      });
    });

    it('should return 500 if an internal error occurs during login', async () => {
      req.body = { email: 'test@example.com', password: 'password123' };

      jest.spyOn(User, 'findOne').mockRejectedValue(new Error('DB Timeout'));

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error during login',
        details: 'DB Timeout'
      });
    });
  });
});