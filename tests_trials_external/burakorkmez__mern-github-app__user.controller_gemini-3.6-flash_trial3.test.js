import { jest } from '@jest/globals';
import User from '../models/user.model.js';
import {
	getUserProfileAndRepos,
	likeProfile,
	getLikes,
} from '../dataset/external/burakorkmez__mern-github-app/backend/controllers/user.controller.js';

jest.mock('../models/user.model.js');

describe('User Controller', () => {
	let req;
	let res;

	beforeEach(() => {
		req = {
			params: {},
			user: {
				_id: { toString: () => '123456789' },
			},
		};
		res = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis(),
		};
		jest.clearAllMocks();
		jest.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('getUserProfileAndRepos', () => {
		beforeEach(() => {
			global.fetch = jest.fn();
		});

		it('should fetch user profile and repos successfully and return 200', async () => {
			req.params.username = 'johndoe';
			const mockUserProfile = {
				login: 'johndoe',
				repos_url: 'https://api.github.com/users/johndoe/repos',
			};
			const mockRepos = [{ name: 'repo-1' }, { name: 'repo-2' }];

			global.fetch
				.mockResolvedValueOnce({
					json: jest.fn().mockResolvedValue(mockUserProfile),
				})
				.mockResolvedValueOnce({
					json: jest.fn().mockResolvedValue(mockRepos),
				});

			await getUserProfileAndRepos(req, res);

			expect(global.fetch).toHaveBeenCalledTimes(2);
			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.json).toHaveBeenCalledWith({
				userProfile: mockUserProfile,
				repos: mockRepos,
			});
		});

		it('should return 500 when fetch throws an error', async () => {
			req.params.username = 'johndoe';
			global.fetch.mockRejectedValueOnce(new Error('GitHub API Error'));

			await getUserProfileAndRepos(req, res);

			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith({ error: 'GitHub API Error' });
		});
	});

	describe('likeProfile', () => {
		it('should successfully like a user profile and return 200', async () => {
			req.params.username = 'janedoe';

			const mockAuthUser = {
				username: 'johndoe',
				avatarUrl: 'https://avatar.com/johndoe.png',
				likedProfiles: [],
				save: jest.fn().mockResolvedValue(true),
			};

			const mockUserToLike = {
				username: 'janedoe',
				likedBy: [],
				save: jest.fn().mockResolvedValue(true),
			};

			User.findById.mockResolvedValue(mockAuthUser);
			User.findOne.mockResolvedValue(mockUserToLike);

			await likeProfile(req, res);

			expect(User.findById).toHaveBeenCalledWith('123456789');
			expect(User.findOne).toHaveBeenCalledWith({ username: 'janedoe' });
			expect(mockAuthUser.likedProfiles).toContain('janedoe');
			expect(mockUserToLike.likedBy).toHaveLength(1);
			expect(mockUserToLike.likedBy[0]).toMatchObject({
				username: 'johndoe',
				avatarUrl: 'https://avatar.com/johndoe.png',
			});
			expect(mockUserToLike.save).toHaveBeenCalled();
			expect(mockAuthUser.save).toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.json).toHaveBeenCalledWith({ message: 'User liked' });
		});

		it('should return 404 if user to like is not found', async () => {
			req.params.username = 'nonexistentuser';

			const mockAuthUser = {
				likedProfiles: [],
			};

			User.findById.mockResolvedValue(mockAuthUser);
			User.findOne.mockResolvedValue(null);

			await likeProfile(req, res);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ error: 'User is not a member' });
		});

		it('should return 400 if user has already liked the profile', async () => {
			req.params.username = 'janedoe';

			const mockAuthUser = {
				username: 'johndoe',
				likedProfiles: ['janedoe'],
			};

			const mockUserToLike = {
				username: 'janedoe',
				likedBy: [],
			};

			User.findById.mockResolvedValue(mockAuthUser);
			User.findOne.mockResolvedValue(mockUserToLike);

			await likeProfile(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ error: 'User already liked' });
		});

		it('should return 500 if database query fails', async () => {
			req.params.username = 'janedoe';
			User.findById.mockRejectedValue(new Error('Database error'));

			await likeProfile(req, res);

			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith({ error: 'Database error' });
		});
	});

	describe('getLikes', () => {
		it('should return list of likes for the authenticated user and status 200', async () => {
			const mockLikedBy = [
				{ username: 'user1', avatarUrl: 'url1', likedDate: Date.now() },
			];
			const mockUser = {
				likedBy: mockLikedBy,
			};

			User.findById.mockResolvedValue(mockUser);

			await getLikes(req, res);

			expect(User.findById).toHaveBeenCalledWith('123456789');
			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.json).toHaveBeenCalledWith({ likedBy: mockLikedBy });
		});

		it('should return 500 when User.findById fails', async () => {
			User.findById.mockRejectedValue(new Error('Failed to retrieve likes'));

			await getLikes(req, res);

			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith({ error: 'Failed to retrieve likes' });
		});
	});
});