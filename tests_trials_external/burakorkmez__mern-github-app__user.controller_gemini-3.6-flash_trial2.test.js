import { jest } from '@jest/globals';
import { getUserProfileAndRepos, likeProfile, getLikes } from '../dataset/external/burakorkmez__mern-github-app/backend/controllers/user.controller.js';
import User from '../dataset/external/burakorkmez__mern-github-app/backend/models/user.model.js';

jest.mock('../dataset/external/burakorkmez__mern-github-app/backend/models/user.model.js');

describe('User Controller Tests', () => {
	let req;
	let res;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.spyOn(console, 'log').mockImplementation(() => {});
		global.fetch = jest.fn();

		req = {
			params: {},
			body: {},
			user: { _id: '60d5ecb8b5c9c22b4c8b4567' }
		};

		res = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis()
		};
	});

	afterEach(() => {
		console.log.mockRestore();
	});

	describe('getUserProfileAndRepos', () => {
		it('should fetch user profile and repos successfully and return 200', async () => {
			req.params.username = 'octocat';
			const mockUserProfile = { login: 'octocat', repos_url: 'https://api.github.com/users/octocat/repos' };
			const mockRepos = [{ id: 1, name: 'hello-world' }];

			global.fetch
				.mockResolvedValueOnce({
					json: jest.fn().mockResolvedValue(mockUserProfile)
				})
				.mockResolvedValueOnce({
					json: jest.fn().mockResolvedValue(mockRepos)
				});

			await getUserProfileAndRepos(req, res);

			expect(global.fetch).toHaveBeenNthCalledWith(
				1,
				'https://api.github.com/users/octocat',
				{ headers: { authorization: `token ${process.env.GITHUB_API_KEY}` } }
			);
			expect(global.fetch).toHaveBeenNthCalledWith(
				2,
				'https://api.github.com/users/octocat/repos',
				{ headers: { authorization: `token ${process.env.GITHUB_API_KEY}` } }
			);
			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.json).toHaveBeenCalledWith({ userProfile: mockUserProfile, repos: mockRepos });
		});

		it('should handle errors and return 500 status', async () => {
			req.params.username = 'octocat';
			global.fetch.mockRejectedValue(new Error('Network error'));

			await getUserProfileAndRepos(req, res);

			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith({ error: 'Network error' });
		});
	});

	describe('likeProfile', () => {
		it('should allow liking a profile successfully', async () => {
			req.params.username = 'janedoe';
			
			const currentUser = {
				_id: '60d5ecb8b5c9c22b4c8b4567',
				username: 'johndoe',
				avatarUrl: 'https://example.com/avatar.jpg',
				likedProfiles: [],
				save: jest.fn().mockResolvedValue(true)
			};

			const userToLike = {
				username: 'janedoe',
				likedBy: [],
				save: jest.fn().mockResolvedValue(true)
			};

			User.findById.mockResolvedValue(currentUser);
			User.findOne.mockResolvedValue(userToLike);

			await likeProfile(req, res);

			expect(User.findById).toHaveBeenCalledWith('60d5ecb8b5c9c22b4c8b4567');
			expect(User.findOne).toHaveBeenCalledWith({ username: 'janedoe' });
			expect(userToLike.likedBy).toHaveLength(1);
			expect(userToLike.likedBy[0]).toMatchObject({ username: 'johndoe', avatarUrl: 'https://example.com/avatar.jpg' });
			expect(currentUser.likedProfiles).toContain('janedoe');
			expect(userToLike.save).toHaveBeenCalled();
			expect(currentUser.save).toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.json).toHaveBeenCalledWith({ message: 'User liked' });
		});

		it('should return 404 if user to like is not found', async () => {
			req.params.username = 'nonexistentuser';
			
			const currentUser = {
				_id: '60d5ecb8b5c9c22b4c8b4567',
				likedProfiles: []
			};

			User.findById.mockResolvedValue(currentUser);
			User.findOne.mockResolvedValue(null);

			await likeProfile(req, res);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ error: 'User is not a member' });
		});

		it('should return 400 if user was already liked', async () => {
			req.params.username = 'janedoe';

			const currentUser = {
				_id: '60d5ecb8b5c9c22b4c8b4567',
				likedProfiles: ['janedoe']
			};

			const userToLike = {
				username: 'janedoe'
			};

			User.findById.mockResolvedValue(currentUser);
			User.findOne.mockResolvedValue(userToLike);

			await likeProfile(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ error: 'User already liked' });
		});

		it('should handle internal errors and return 500 status', async () => {
			req.params.username = 'janedoe';
			User.findById.mockRejectedValue(new Error('Database error'));

			await likeProfile(req, res);

			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith({ error: 'Database error' });
		});
	});

	describe('getLikes', () => {
		it('should return list of likes for the authenticated user with 200 status', async () => {
			const mockLikedBy = [
				{ username: 'janedoe', avatarUrl: 'https://example.com/jane.jpg', likedDate: 123456789 }
			];
			const currentUser = {
				_id: '60d5ecb8b5c9c22b4c8b4567',
				likedBy: mockLikedBy
			};

			User.findById.mockResolvedValue(currentUser);

			await getLikes(req, res);

			expect(User.findById).toHaveBeenCalledWith('60d5ecb8b5c9c22b4c8b4567');
			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.json).toHaveBeenCalledWith({ likedBy: mockLikedBy });
		});

		it('should handle errors and return 500 status', async () => {
			User.findById.mockRejectedValue(new Error('Failed to retrieve likes'));

			await getLikes(req, res);

			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith({ error: 'Failed to retrieve likes' });
		});
	});
});