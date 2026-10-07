import { jest } from '@jest/globals';

jest.mock('../models/user.model.js', () => {
  const MockUserModel = jest.fn().mockImplementation(() => ({
    displayName: '',
    username: '',
    id: 'user_id_123',
    _doc: { displayName: 'Test User', username: 'testuser' },
    setPassword: jest.fn(),
    save: jest.fn().mockResolvedValue(true)
  }));

  MockUserModel.findOne = jest.fn();
  MockUserModel.findById = jest.fn();

  return {
    __esModule: true,
    default: MockUserModel
  };
});

jest.mock('jsonwebtoken', () => ({
  __esModule: true,
  default: {
    sign: jest.fn()
  }
}));

jest.mock('../handlers/response.handler.js', () => ({
  __esModule: true,
  default: {
    badrequest: jest.fn(),
    created: jest.fn(),
    ok: jest.fn(),
    error: jest.fn(),
    unauthorize: jest.fn(),
    notfound: jest.fn()
  }
}));

import userModel from '../models/user.model.js';
import jsonwebtoken from 'jsonwebtoken';
import responseHandler from '../handlers/response.handler.js';
import userController from '../dataset/external/trananhtuat__fullstack-mern-movie-2022/server/src/controllers/user.controller.js';

describe('User Controller', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      body: {},
      user: {}
    };
    res = {};
    process.env.TOKEN_SECRET = 'test_secret';
  });

  describe('signup', () => {
    it('should return badrequest if username is already used', async () => {
      req.body = { username: 'existinguser', password: 'password123', displayName: 'Existing User' };
      userModel.findOne.mockResolvedValue({ id: 'existing_id', username: 'existinguser' });

      await userController.signup(req, res);

      expect(userModel.findOne).toHaveBeenCalledWith({ username: 'existinguser' });
      expect(responseHandler.badrequest).toHaveBeenCalledWith(res, 'username already used');
      expect(responseHandler.created).not.toHaveBeenCalled();
    });

    it('should create user, generate token, and return created on success', async () => {
      req.body = { username: 'newuser', password: 'password123', displayName: 'New User' };
      userModel.findOne.mockResolvedValue(null);
      jsonwebtoken.sign.mockReturnValue('mock_token');

      await userController.signup(req, res);

      expect(userModel.findOne).toHaveBeenCalledWith({ username: 'newuser' });
      expect(userModel).toHaveBeenCalled();
      expect(jsonwebtoken.sign).toHaveBeenCalledWith(
        { data: 'user_id_123' },
        'test_secret',
        { expiresIn: '24h' }
      );
      expect(responseHandler.created).toHaveBeenCalledWith(res, {
        token: 'mock_token',
        displayName: 'Test User',
        username: 'testuser',
        id: 'user_id_123'
      });
    });

    it('should call error handler when an exception occurs', async () => {
      req.body = { username: 'newuser' };
      userModel.findOne.mockRejectedValue(new Error('Database error'));

      await userController.signup(req, res);

      expect(responseHandler.error).toHaveBeenCalledWith(res);
    });
  });

  describe('signin', () => {
    it('should return badrequest if user does not exist', async () => {
      req.body = { username: 'unknownuser', password: 'password123' };
      userModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      await userController.signin(req, res);

      expect(userModel.findOne).toHaveBeenCalledWith({ username: 'unknownuser' });
      expect(responseHandler.badrequest).toHaveBeenCalledWith(res, 'User not exist');
    });

    it('should return badrequest if password is wrong', async () => {
      req.body = { username: 'user1', password: 'wrongpassword' };
      const mockUser = {
        validPassword: jest.fn().mockReturnValue(false)
      };
      userModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      await userController.signin(req, res);

      expect(mockUser.validPassword).toHaveBeenCalledWith('wrongpassword');
      expect(responseHandler.badrequest).toHaveBeenCalledWith(res, 'Wrong password');
    });

    it('should return created with token on valid credentials', async () => {
      req.body = { username: 'user1', password: 'validpassword' };
      const mockUser = {
        id: 'user_id_123',
        password: 'hashedpassword',
        salt: 'randomsalt',
        _doc: { username: 'user1', displayName: 'User One' },
        validPassword: jest.fn().mockReturnValue(true)
      };
      userModel.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });
      jsonwebtoken.sign.mockReturnValue('mock_token');

      await userController.signin(req, res);

      expect(mockUser.password).toBeUndefined();
      expect(mockUser.salt).toBeUndefined();
      expect(jsonwebtoken.sign).toHaveBeenCalledWith(
        { data: 'user_id_123' },
        'test_secret',
        { expiresIn: '24h' }
      );
      expect(responseHandler.created).toHaveBeenCalledWith(res, {
        token: 'mock_token',
        username: 'user1',
        displayName: 'User One',
        id: 'user_id_123'
      });
    });

    it('should call error handler on exception during signin', async () => {
      req.body = { username: 'user1', password: 'validpassword' };
      userModel.findOne.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await userController.signin(req, res);

      expect(responseHandler.error).toHaveBeenCalledWith(res);
    });
  });

  describe('updatePassword', () => {
    it('should return unauthorize if user is not found', async () => {
      req.user = { id: 'invalid_user_id' };
      req.body = { password: 'oldPassword', newPassword: 'newPassword' };
      userModel.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      await userController.updatePassword(req, res);

      expect(userModel.findById).toHaveBeenCalledWith('invalid_user_id');
      expect(responseHandler.unauthorize).toHaveBeenCalledWith(res);
    });

    it('should return badrequest if current password is wrong', async () => {
      req.user = { id: 'user_id_123' };
      req.body = { password: 'wrongOldPassword', newPassword: 'newPassword' };
      const mockUser = {
        validPassword: jest.fn().mockReturnValue(false)
      };
      userModel.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      await userController.updatePassword(req, res);

      expect(mockUser.validPassword).toHaveBeenCalledWith('wrongOldPassword');
      expect(responseHandler.badrequest).toHaveBeenCalledWith(res, 'Wrong password');
    });

    it('should update password and return ok on success', async () => {
      req.user = { id: 'user_id_123' };
      req.body = { password: 'correctOldPassword', newPassword: 'newPassword123' };
      const mockUser = {
        validPassword: jest.fn().mockReturnValue(true),
        setPassword: jest.fn(),
        save: jest.fn().mockResolvedValue(true)
      };
      userModel.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      await userController.updatePassword(req, res);

      expect(mockUser.setPassword).toHaveBeenCalledWith('newPassword123');
      expect(mockUser.save).toHaveBeenCalled();
      expect(responseHandler.ok).toHaveBeenCalledWith(res);
    });

    it('should call error handler on exception during updatePassword', async () => {
      req.user = { id: 'user_id_123' };
      req.body = { password: 'pass', newPassword: 'newpass' };
      userModel.findById.mockImplementation(() => {
        throw new Error('Database error');
      });

      await userController.updatePassword(req, res);

      expect(responseHandler.error).toHaveBeenCalledWith(res);
    });
  });

  describe('getInfo', () => {
    it('should return notfound if user does not exist', async () => {
      req.user = { id: 'nonexistent_id' };
      userModel.findById.mockResolvedValue(null);

      await userController.getInfo(req, res);

      expect(userModel.findById).toHaveBeenCalledWith('nonexistent_id');
      expect(responseHandler.notfound).toHaveBeenCalledWith(res);
    });

    it('should return ok with user info if user exists', async () => {
      req.user = { id: 'user_id_123' };
      const mockUser = { id: 'user_id_123', username: 'testuser', displayName: 'Test User' };
      userModel.findById.mockResolvedValue(mockUser);

      await userController.getInfo(req, res);

      expect(userModel.findById).toHaveBeenCalledWith('user_id_123');
      expect(responseHandler.ok).toHaveBeenCalledWith(res, mockUser);
    });

    it('should call error handler on exception during getInfo', async () => {
      req.user = { id: 'user_id_123' };
      userModel.findById.mockRejectedValue(new Error('Fetch failed'));

      await userController.getInfo(req, res);

      expect(responseHandler.error).toHaveBeenCalledWith(res);
    });
  });
});