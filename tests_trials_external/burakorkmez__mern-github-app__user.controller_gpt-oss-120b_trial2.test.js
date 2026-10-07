import { jest } from '@jest/globals';
import {
  getUserProfileAndRepos,
  likeProfile,
  getLikes,
} from '../dataset/external/burakorkmez__mern-github-app/backend/controllers/user.controller.js';

// Mock the User model
jest.mock(
  '../dataset/external/burakorkmez__mern-github-app/backend/models/user.model.js',
  () => {
    const mockUser = {
      findById: jest.fn(),
      findOne: jest.fn(),
    };
    return { __esModule: true, default: mockUser };
  }
);

import User from '../dataset/external/burakorkmez__mern-github-app/backend/models/user.model.js';

describe('user.controller', () => {
  const createRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GITHUB_API_KEY = 'test-key';
  });

  describe('getUserProfileAndRepos', () => {
    const mockFetch = jest.fn();

    beforeAll(() => {
      global.fetch = mockFetch;
    });

    afterAll(() => {
      delete global.fetch;
    });

    it('should return user profile and repos on success', async () => {
      const userProfile = { login: 'testuser', repos_url: 'https://api.github.com/users/testuser/repos' };
      const repos = [{ id: 1, name: 'repo1' }];

      mockFetch
        .mockResolvedValueOnce({ json: jest.fn().mockResolvedValueOnce(userProfile) })
        .mockResolvedValueOnce({ json: jest.fn().mockResolvedValueOnce(repos) });

      const req = { params: { username: 'testuser' } };
      const res = createRes();

      await getUserProfileAndRepos(req, res);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        `https://api.github.com/users/testuser`,
        expect.objectContaining({
          headers: { authorization: `token ${process.env.GITHUB_API_KEY}` },
        })
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        userProfile.repos_url,
        expect.objectContaining({
          headers: { authorization: `token ${process.env.GITHUB_API_KEY}` },
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ userProfile, repos });
    });

    it('should handle fetch errors and respond with 500', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network error'));

      const req = { params: { username: 'testuser' } };
      const res = createRes();

      await getUserProfileAndRepos(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'network error' });
    });
  });

  describe('likeProfile', () => {
    const authUser = {
      _id: 'auth-id',
      username: 'authUser',
      avatarUrl: 'http://avatar.url',
      likedProfiles: [],
      likedBy: [],
      save: jest.fn().mockResolvedValue(),
    };

    const targetUser = {
      username: 'targetUser',
      likedBy: [],
      likedProfiles: [],
      save: jest.fn().mockResolvedValue(),
    };

    it('should like a profile successfully', async () => {
      User.findById.mockResolvedValueOnce(authUser);
      User.findOne.mockResolvedValueOnce(targetUser);

      const req = { params: { username: 'targetUser' }, user: { _id: 'auth-id' } };
      const res = createRes();

      await likeProfile(req, res);

      expect(User.findById).toHaveBeenCalledWith('auth-id');
      expect(User.findOne).toHaveBeenCalledWith({ username: 'targetUser' });
      expect(targetUser.likedBy).toHaveLength(1);
      expect(authUser.likedProfiles).toContain('targetUser');
      expect(targetUser.save).toHaveBeenCalled();
      expect(authUser.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'User liked' });
    });

    it('should return 404 when the profile to like does not exist', async () => {
      User.findById.mockResolvedValueOnce(authUser);
      User.findOne.mockResolvedValueOnce(null);

      const req = { params: { username: 'nonexistent' }, user: { _id: 'auth-id' } };
      const res = createRes();

      await likeProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User is not a member' });
    });

    it('should return 400 when the profile is already liked', async () => {
      authUser.likedProfiles = ['targetUser'];
      User.findById.mockResolvedValueOnce(authUser);
      User.findOne.mockResolvedValueOnce(targetUser);

      const req = { params: { username: 'targetUser' }, user: { _id: 'auth-id' } };
      const res = createRes();

      await likeProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'User already liked' });
    });

    it('should handle internal errors with 500', async () => {
      User.findById.mockRejectedValueOnce(new Error('db error'));

      const req = { params: { username: 'any' }, user: { _id: 'auth-id' } };
      const res = createRes();

      await likeProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'db error' });
    });
  });

  describe('getLikes', () => {
    it('should return likedBy array for the authenticated user', async () => {
      const user = {
        likedBy: [{ username: 'someone', likedDate: Date.now() }],
      };
      User.findById.mockResolvedValueOnce(user);

      const req = { user: { _id: 'auth-id' } };
      const res = createRes();

      await getLikes(req, res);

      expect(User.findById).toHaveBeenCalledWith('auth-id');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ likedBy: user.likedBy });
    });

    it('should handle errors with 500', async () => {
      User.findById.mockRejectedValueOnce(new Error('lookup fail'));

      const req = { user: { _id: 'auth-id' } };
      const res = createRes();

      await getLikes(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'lookup fail' });
    });
  });
});