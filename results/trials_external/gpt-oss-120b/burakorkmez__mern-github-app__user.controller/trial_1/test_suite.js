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
    return {
      __esModule: true,
      default: {
        findById: jest.fn(),
        findOne: jest.fn(),
      },
    };
  }
);
import User from '../dataset/external/burakorkmez__mern-github-app/backend/models/user.model.js';

// Helper to create a mock response object
const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('user.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset global fetch mock
    global.fetch = jest.fn();
  });

  describe('getUserProfileAndRepos', () => {
    it('should return user profile and repos on success', async () => {
      const fakeProfile = { login: 'john', repos_url: 'https://api.github.com/users/john/repos' };
      const fakeRepos = [{ id: 1, name: 'repo1' }];

      // Mock fetch for user profile
      global.fetch
        .mockResolvedValueOnce({
          json: jest.fn().mockResolvedValueOnce(fakeProfile),
        })
        // Mock fetch for repos
        .mockResolvedValueOnce({
          json: jest.fn().mockResolvedValueOnce(fakeRepos),
        });

      const req = { params: { username: 'john' } };
      const res = createRes();

      await getUserProfileAndRepos(req, res);

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.github.com/users/john',
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: expect.stringContaining('token') }),
        })
      );
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        fakeProfile.repos_url,
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: expect.stringContaining('token') }),
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ userProfile: fakeProfile, repos: fakeRepos });
    });

    it('should return 500 when fetch throws', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      const req = { params: { username: 'john' } };
      const res = createRes();

      await getUserProfileAndRepos(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Network error' });
    });
  });

  describe('likeProfile', () => {
    const authUserId = 'auth-id';
    const authUser = {
      _id: authUserId,
      username: 'authUser',
      avatarUrl: 'http://avatar',
      likedProfiles: [],
      likedBy: [],
      save: jest.fn().mockResolvedValue(),
    };
    const targetUser = {
      _id: 'target-id',
      username: 'targetUser',
      likedBy: [],
      save: jest.fn().mockResolvedValue(),
    };

    const reqBase = { user: { _id: authUserId } };
    const res = createRes();

    beforeEach(() => {
      // Reset response mock for each test
      res.status.mockClear();
      res.json.mockClear();
    });

    it('should like a profile successfully', async () => {
      User.findById.mockResolvedValueOnce(authUser);
      User.findOne.mockResolvedValueOnce(targetUser);

      const req = { ...reqBase, params: { username: targetUser.username } };

      await likeProfile(req, res);

      expect(User.findById).toHaveBeenCalledWith(authUserId);
      expect(User.findOne).toHaveBeenCalledWith({ username: targetUser.username });
      expect(targetUser.likedBy).toHaveLength(1);
      expect(authUser.likedProfiles).toContain(targetUser.username);
      expect(targetUser.save).toHaveBeenCalled();
      expect(authUser.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'User liked' });
    });

    it('should return 404 when target user does not exist', async () => {
      User.findById.mockResolvedValueOnce(authUser);
      User.findOne.mockResolvedValueOnce(null);

      const req = { ...reqBase, params: { username: 'nonexistent' } };

      await likeProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User is not a member' });
    });

    it('should return 400 when profile already liked', async () => {
      authUser.likedProfiles = [targetUser.username];
      User.findById.mockResolvedValueOnce(authUser);
      User.findOne.mockResolvedValueOnce(targetUser);

      const req = { ...reqBase, params: { username: targetUser.username } };

      await likeProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'User already liked' });
    });

    it('should return 500 on unexpected error', async () => {
      User.findById.mockRejectedValueOnce(new Error('DB failure'));

      const req = { ...reqBase, params: { username: targetUser.username } };

      await likeProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'DB failure' });
    });
  });

  describe('getLikes', () => {
    const authUserId = 'auth-id';
    const likedBy = [{ username: 'john', avatarUrl: 'url', likedDate: Date.now() }];

    beforeEach(() => {
      User.findById.mockResolvedValue({
        _id: authUserId,
        likedBy,
      });
    });

    it('should return likedBy array', async () => {
      const req = { user: { _id: authUserId } };
      const res = createRes();

      await getLikes(req, res);

      expect(User.findById).toHaveBeenCalledWith(authUserId);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ likedBy });
    });

    it('should return 500 on error', async () => {
      User.findById.mockRejectedValueOnce(new Error('DB error'));

      const req = { user: { _id: authUserId } };
      const res = createRes();

      await getLikes(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'DB error' });
    });
  });
});