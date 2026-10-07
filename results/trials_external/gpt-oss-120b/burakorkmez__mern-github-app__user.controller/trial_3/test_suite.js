import { jest } from '@jest/globals';
import {
  getUserProfileAndRepos,
  likeProfile,
  getLikes,
} from '../dataset/external/burakorkmez__mern-github-app/backend/controllers/user.controller.js';

// Mock the User model
jest.mock(
  '../dataset/external/burakorkmez__mern-github-app/backend/models/user.model.js',
  () => ({
    __esModule: true,
    default: {
      findById: jest.fn(),
      findOne: jest.fn(),
    },
  })
);
import User from '../dataset/external/burakorkmez__mern-github-app/backend/models/user.model.js';

// Helper to create mock response objects
const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('user.controller', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserProfileAndRepos', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv, GITHUB_API_KEY: 'test-key' };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should return user profile and repos on success', async () => {
      const mockUserProfile = { login: 'john', repos_url: 'https://api.github.com/users/john/repos' };
      const mockRepos = [{ id: 1, name: 'repo1' }];

      global.fetch = jest.fn()
        // first call for user profile
        .mockResolvedValueOnce({
          json: jest.fn().mockResolvedValueOnce(mockUserProfile),
        })
        // second call for repos
        .mockResolvedValueOnce({
          json: jest.fn().mockResolvedValueOnce(mockRepos),
        });

      const req = { params: { username: 'john' } };
      const res = createRes();

      await getUserProfileAndRepos(req, res);

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.github.com/users/john',
        expect.objectContaining({
          headers: { authorization: `token test-key` },
        })
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        mockUserProfile.repos_url,
        expect.objectContaining({
          headers: { authorization: `token test-key` },
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        userProfile: mockUserProfile,
        repos: mockRepos,
      });
    });

    it('should handle fetch errors and respond with 500', async () => {
      global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'));

      const req = { params: { username: 'john' } };
      const res = createRes();

      await getUserProfileAndRepos(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Network error' });
    });
  });

  describe('likeProfile', () => {
    const mockAuthUser = {
      _id: 'auth-id',
      username: 'authUser',
      avatarUrl: 'http://avatar',
      likedProfiles: [],
      likedBy: [],
      save: jest.fn().mockResolvedValue(),
    };

    const mockTargetUser = {
      username: 'targetUser',
      likedBy: [],
      likedProfiles: [],
      save: jest.fn().mockResolvedValue(),
    };

    beforeEach(() => {
      // Reset user mocks
      mockAuthUser.likedProfiles = [];
      mockAuthUser.likedBy = [];
      mockAuthUser.save.mockClear();

      mockTargetUser.likedBy = [];
      mockTargetUser.likedProfiles = [];
      mockTargetUser.save.mockClear();
    });

    it('should return 404 when the target user does not exist', async () => {
      User.findById.mockResolvedValueOnce(mockAuthUser);
      User.findOne.mockResolvedValueOnce(null);

      const req = { params: { username: 'nonexistent' }, user: { _id: 'auth-id' } };
      const res = createRes();

      await likeProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User is not a member' });
      expect(User.findOne).toHaveBeenCalledWith({ username: 'nonexistent' });
    });

    it('should return 400 when the profile is already liked', async () => {
      mockAuthUser.likedProfiles = ['targetUser'];
      User.findById.mockResolvedValueOnce(mockAuthUser);
      User.findOne.mockResolvedValueOnce(mockTargetUser);

      const req = { params: { username: 'targetUser' }, user: { _id: 'auth-id' } };
      const res = createRes();

      await likeProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'User already liked' });
    });

    it('should like a profile successfully and save both users', async () => {
      User.findById.mockResolvedValueOnce(mockAuthUser);
      User.findOne.mockResolvedValueOnce(mockTargetUser);

      const req = { params: { username: 'targetUser' }, user: { _id: 'auth-id' } };
      const res = createRes();

      await likeProfile(req, res);

      expect(mockTargetUser.likedBy).toHaveLength(1);
      expect(mockTargetUser.likedBy[0]).toMatchObject({
        username: mockAuthUser.username,
        avatarUrl: mockAuthUser.avatarUrl,
      });
      expect(mockAuthUser.likedProfiles).toContain('targetUser');

      expect(mockTargetUser.save).toHaveBeenCalledTimes(1);
      expect(mockAuthUser.save).toHaveBeenCalledTimes(1);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'User liked' });
    });

    it('should handle unexpected errors with 500', async () => {
      User.findById.mockRejectedValueOnce(new Error('DB failure'));

      const req = { params: { username: 'any' }, user: { _id: 'auth-id' } };
      const res = createRes();

      await likeProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'DB failure' });
    });
  });

  describe('getLikes', () => {
    it('should return likedBy array for the authenticated user', async () => {
      const mockUser = {
        likedBy: [{ username: 'john', likedDate: 123 }],
      };
      User.findById.mockResolvedValueOnce(mockUser);

      const req = { user: { _id: 'auth-id' } };
      const res = createRes();

      await getLikes(req, res);

      expect(User.findById).toHaveBeenCalledWith('auth-id');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ likedBy: mockUser.likedBy });
    });

    it('should handle errors and respond with 500', async () => {
      User.findById.mockRejectedValueOnce(new Error('DB error'));

      const req = { user: { _id: 'auth-id' } };
      const res = createRes();

      await getLikes(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'DB error' });
    });
  });
});