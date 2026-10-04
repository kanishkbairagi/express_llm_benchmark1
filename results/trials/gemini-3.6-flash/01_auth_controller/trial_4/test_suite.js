import { jest } from '@jest/globals';
import { signup, login, User, PasswordHelper, TokenService } from '../dataset/01_auth_controller.js';

describe('01_auth_controller', () => {
  let req, res;

  beforeEach(() => {
    req = { body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  describe('signup', () => {
    it('should return 400 if required fields are missing', async () => {
      req.body = { email: 'test@example.com' };

      await signup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing required fields: email, password, and name are required'
      });
    });

    it('should return 400 if req.body is undefined', async () => {
      req = {};

      await signup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing required fields: email, password, and name are required'
      });
    });

    it('should return 400 if email format is invalid', async () => {
      req.body = { email: 'invalid-email', password: 'password123', name: 'John' };

      await signup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid email format'
      });
    });

    it('should return 400 if password is less than 8 characters', async () => {
      req.body = { email: 'test@example.com', password: 'short', name: 'John' };

      await signup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Password must be at least 8 characters long'
      });
    });

    it('should return 400 if password is not a string', async () => {
      req.body = { email: 'test@example.com', password: 12345678, name: 'John' };

      await signup(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Password must be at least 8 characters long'
      });
    });

    it('should return 409 if user with email already exists', async () => {
      req.body = { email: 'Existing@Example.com', password: 'password123', name: 'John' };
      jest.spyOn(User, 'findOne').mockResolvedValue({ id: '1', email: 'existing@example.com' });

      await signup(req, res);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'existing@example.com' });
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'An account with this email already exists'
      });
    });

    it('should register user successfully with 201', async () => {
      req.body = { email: 'NewUser@example.com', password: 'password123', name: ' John Doe ' };
      
      jest.spyOn(User, 'findOne').mockResolvedValue(null);
      jest.spyOn(PasswordHelper, 'hash').mockResolvedValue('hashed_password123');
      jest.spyOn(User, 'create').mockResolvedValue({
        id: 'new-id',
        name: 'John Doe',
        email: 'newuser@example.com',
        password: 'hashed_password123',
        role: 'user',
        isBlocked: false
      });
      jest.spyOn(TokenService, 'generateToken').mockReturnValue('mock_token');

      await signup(req, res);

      expect(PasswordHelper.hash).toHaveBeenCalledWith('password123');
      expect(User.create).toHaveBeenCalledWith({
        name: 'John Doe',
        email: 'newuser@example.com',
        password: 'hashed_password123',
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
            name: 'John Doe',
            email: 'newuser@example.com',
            role: 'user'
          },
          token: 'mock_token'
        }
      });
    });

    it('should handle internal errors with 500', async () => {
      req.body = { email: 'test@example.com', password: 'password123', name: 'John' };
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
      req.body = { email: 'test@example.com' };

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Email and password are required'
      });
    });

    it('should return 401 if user is not found', async () => {
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

    it('should return 401 if password does not match', async () => {
      req.body = { email: 'test@example.com', password: 'wrongpassword' };
      jest.spyOn(User, 'findOne').mockResolvedValue({
        id: '1',
        email: 'test@example.com',
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

    it('should return 200 and token on successful login', async () => {
      req.body = { email: 'Test@example.com', password: 'password123' };
      const mockUser = {
        id: 'user-123',
        name: 'Jane Doe',
        email: 'test@example.com',
        password: 'hashed_password123',
        role: 'admin',
        isBlocked: false
      };

      jest.spyOn(User, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(PasswordHelper, 'compare').mockResolvedValue(true);
      jest.spyOn(TokenService, 'generateToken').mockReturnValue('jwt_token_123');

      await login(req, res);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(PasswordHelper.compare).toHaveBeenCalledWith('password123', 'hashed_password123');
      expect(TokenService.generateToken).toHaveBeenCalledWith({ id: 'user-123', role: 'admin' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: 'user-123',
            name: 'Jane Doe',
            email: 'test@example.com',
            role: 'admin'
          },
          token: 'jwt_token_123'
        }
      });
    });

    it('should handle internal errors with 500', async () => {
      req.body = { email: 'test@example.com', password: 'password123' };
      jest.spyOn(User, 'findOne').mockRejectedValue(new Error('Unexpected DB Error'));

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error during login',
        details: 'Unexpected DB Error'
      });
    });
  });
});