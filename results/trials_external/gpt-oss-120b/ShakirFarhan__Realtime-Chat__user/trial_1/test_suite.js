import { jest } from '@jest/globals';
import {
  register,
  login,
  validUser,
  googleAuth,
  logout,
  searchUsers,
  getUserById,
  updateInfo,
} from '../dataset/external/ShakirFarhan__Realtime-Chat/server/controllers/user.js';
import userModel from '../dataset/external/ShakirFarhan__Realtime-Chat/server/models/userModel.js';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';

jest.mock('../dataset/external/ShakirFarhan__Realtime-Chat/server/models/userModel.js');
jest.mock('bcryptjs');
jest.mock('google-auth-library');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  return res;
};

describe('User Controllers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CLIENT_ID = 'test-client-id';
  });

  describe('register', () => {
    it('should register a new user and return token', async () => {
      const req = {
        body: {
          firstname: 'John',
          lastname: 'Doe',
          email: 'john@example.com',
          password: 'secret',
        },
      };
      const res = mockRes();

      // mock findOne to return null (no existing user)
      userModel.findOne = jest.fn().mockResolvedValue(null);

      // mock user instance
      const saveMock = jest.fn().mockResolvedValue();
      const generateTokenMock = jest.fn().mockResolvedValue('jwt-token');
      const UserMock = jest.fn().mockImplementation((data) => ({
        ...data,
        save: saveMock,
        generateAuthToken: generateTokenMock,
      }));
      userModel.mockImplementation(UserMock);

      await register(req, res);

      expect(userModel.findOne).toHaveBeenCalledWith({ email: 'john@example.com' });
      expect(UserMock).toHaveBeenCalledWith({
        email: 'john@example.com',
        password: 'secret',
        name: 'John Doe',
      });
      expect(saveMock).toHaveBeenCalled();
      expect(generateTokenMock).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'success', token: 'jwt-token' });
    });

    it('should respond with 400 if user already exists', async () => {
      const req = { body: { email: 'exists@example.com' } };
      const res = mockRes();
      userModel.findOne = jest.fn().mockResolvedValue({}); // existing user

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'User already Exits' });
    });
  });

  describe('login', () => {
    it('should login valid user and set cookie', async () => {
      const req = {
        body: { email: 'john@example.com', password: 'secret' },
      };
      const res = mockRes();

      const userDoc = {
        password: 'hashed',
        generateAuthToken: jest.fn().mockResolvedValue('jwt-token'),
        save: jest.fn().mockResolvedValue(),
      };
      userModel.findOne = jest.fn().mockResolvedValue(userDoc);
      bcrypt.compare = jest.fn().mockResolvedValue(true);

      await login(req, res);

      expect(userModel.findOne).toHaveBeenCalledWith({ email: 'john@example.com' });
      expect(bcrypt.compare).toHaveBeenCalledWith('secret', 'hashed');
      expect(userDoc.generateAuthToken).toHaveBeenCalled();
      expect(res.cookie).toHaveBeenCalledWith('userToken', 'jwt-token', {
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ token: 'jwt-token', status: 200 });
    });

    it('should respond with message when user does not exist', async () => {
      const req = { body: { email: 'missing@example.com' } };
      const res = mockRes();
      userModel.findOne = jest.fn().mockResolvedValue(null);

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'User dont exist' });
    });

    it('should respond with invalid credentials when password mismatch', async () => {
      const req = { body: { email: 'john@example.com', password: 'wrong' } };
      const res = mockRes();

      const userDoc = { password: 'hashed' };
      userModel.findOne = jest.fn().mockResolvedValue(userDoc);
      bcrypt.compare = jest.fn().mockResolvedValue(false);

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Invalid Credentials' });
    });
  });

  describe('validUser', () => {
    it('should return user data when found', async () => {
      const req = { rootUserId: 'uid123', token: 'tok' };
      const res = mockRes();

      const userDoc = { _id: 'uid123', email: 'john@example.com' };
      const chain = {
        select: jest.fn().mockResolvedValue(userDoc),
      };
      userModel.findOne = jest.fn().mockReturnValue(chain);

      await validUser(req, res);

      expect(userModel.findOne).toHaveBeenCalledWith({ _id: 'uid123' });
      expect(chain.select).toHaveBeenCalledWith('-password');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ user: userDoc, token: 'tok' });
    });

    it('should respond with message when user not found', async () => {
      const req = { rootUserId: 'uid123' };
      const res = mockRes();

      const chain = { select: jest.fn().mockResolvedValue(null) };
      userModel.findOne = jest.fn().mockReturnValue(chain);

      await validUser(req, res);

      expect(res.json).toHaveBeenCalledWith({ message: 'user is not valid' });
    });
  });

  describe('googleAuth', () => {
    const tokenId = 'google-token';
    const payload = {
      email_verified: true,
      email: 'google@example.com',
      name: 'Google User',
      picture: 'http://pic',
    };

    beforeEach(() => {
      OAuth2Client.mockImplementation(() => ({
        verifyIdToken: jest.fn().mockResolvedValue({ payload }),
      }));
    });

    it('should login existing google user', async () => {
      const req = { body: { tokenId } };
      const res = mockRes();

      const existingUser = { _id: 'uid', email: payload.email };
      userModel.findOne = jest.fn().mockResolvedValue(existingUser).mockReturnValueOnce({
        select: jest.fn().mockResolvedValue(existingUser),
      });

      await googleAuth(req, res);

      expect(OAuth2Client).toHaveBeenCalledWith(process.env.CLIENT_ID);
      expect(res.cookie).toHaveBeenCalledWith('userToken', tokenId, expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ token: tokenId, user: existingUser });
    });

    it('should register new google user when not existing', async () => {
      const req = { body: { tokenId } };
      const res = mockRes();

      const saveMock = jest.fn().mockResolvedValue();
      const UserMock = jest.fn().mockImplementation(() => ({
        save: saveMock,
      }));
      userModel.mockImplementation(UserMock);
      userModel.findOne = jest.fn().mockResolvedValue(null).mockReturnValueOnce({
        select: jest.fn().mockResolvedValue(null),
      });

      await googleAuth(req, res);

      expect(UserMock).toHaveBeenCalledWith({
        name: payload.name,
        profilePic: payload.picture,
        password: payload.email + process.env.CLIENT_ID,
        email: payload.email,
      });
      expect(saveMock).toHaveBeenCalled();
      expect(res.cookie).toHaveBeenCalledWith('userToken', tokenId, expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'User registered Successfully',
        token: tokenId,
      });
    });

    it('should respond with message when email not verified', async () => {
      const req = { body: { tokenId } };
      const res = mockRes();
      OAuth2Client.mockImplementation(() => ({
        verifyIdToken: jest.fn().mockResolvedValue({
          payload: { ...payload, email_verified: false },
        }),
      }));
      await googleAuth(req, res);
      expect(res.json).toHaveBeenCalledWith({ message: 'Email Not Verified' });
    });
  });

  describe('logout', () => {
    it('should filter out the current token from user tokens', () => {
      const req = {
        rootUser: { tokens: [{ token: 'a' }, { token: 'b' }] },
        token: 'a',
      };
      const res = mockRes();

      logout(req, res);

      expect(req.rootUser.tokens).toEqual([{ token: 'b' }]);
    });
  });

  describe('searchUsers', () => {
    it('should return filtered users based on query', async () => {
      const req = {
        query: { search: 'john' },
        rootUserId: 'myId',
      };
      const res = mockRes();

      const findMock = jest.fn().mockReturnThis();
      const findFinal = jest.fn().mockResolvedValue(['u1', 'u2']);
      userModel.find = jest.fn().mockReturnValue({ find: findMock });
      findMock.mockReturnValue({ find: findFinal });

      await searchUsers(req, res);

      expect(userModel.find).toHaveBeenCalledWith({
        $or: [
          { name: { $regex: 'john', $options: 'i' } },
          { email: { $regex: 'john', $options: 'i' } },
        ],
      });
      expect(findFinal).toHaveBeenCalledWith({ _id: { $ne: 'myId' } });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(['u1', 'u2']);
    });

    it('should return all other users when no search query', async () => {
      const req = { query: {}, rootUserId: 'myId' };
      const res = mockRes();

      const findFinal = jest.fn().mockResolvedValue(['u3']);
      userModel.find = jest.fn().mockReturnValue({ find: findFinal });

      await searchUsers(req, res);

      expect(findFinal).toHaveBeenCalledWith({ _id: { $ne: 'myId' } });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(['u3']);
    });
  });

  describe('getUserById', () => {
    it('should return user data for given id', async () => {
      const req = { params: { id: 'uid123' } };
      const res = mockRes();

      const userDoc = { _id: 'uid123', email: 'john@example.com' };
      userModel.findOne = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(userDoc) });

      await getUserById(req, res);

      expect(userModel.findOne).toHaveBeenCalledWith({ _id: 'uid123' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(userDoc);
    });
  });

  describe('updateInfo', () => {
    it('should call findByIdAndUpdate and return updated user', async () => {
      const req = {
        params: { id: 'uid123' },
        body: { name: 'New Name', bio: 'new bio' },
      };
      const res = mockRes();

      const updated = { _id: 'uid123', name: 'New Name', bio: 'new bio' };
      userModel.findByIdAndUpdate = jest.fn().mockResolvedValue(updated);

      const result = await updateInfo(req, res);
      expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith('uid123', {
        name: 'New Name',
        bio: 'new bio',
      });
      expect(result).toBe(updated);
    });
  });
});