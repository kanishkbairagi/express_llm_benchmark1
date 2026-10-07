import { jest } from '@jest/globals';

jest.unstable_mockModule('../models/user.model.js', () => ({
	default: {
		findById: jest.fn(),
		findOne: jest.fn(),
	},
}));

const User = (await import('../models/user.model.js')).default;
const { getUserProfileAndRepos, likeProfile, getLikes } = await import(
	'../dataset/external/burakorkmez__mern-github-app/backend/controllers/user.controller.js'
);

describe('User Controller Unit Tests', () => {
	let req;
	let res;

	beforeEach(() => {
		jest.clearAllMocks();
		req = {
			params: {},
			body: {},
			user: null,
		};
		res = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis(),
		};
		process.env.GITHUB_API_KEY = 'mock_api_key';
		jest.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('getUserProfileAndRepos', () => {
		it('should fetch profile and repos successfully and return 200', async () => {
			req.params.username = 'octocat';
			const mockUserProfile = {
				login: 'octocat',
				repos_url: 'https://api.github.com/users/octocat/repos',
			};
			const mockRepos = [{ id: 1, name: 'repo1' }];

			global.fetch = jest
				.fn()
				.mockResolvedValueOnce({
					json: jest.fn().mockResolvedValue(mockUserProfile),
				})
				.mockResolvedValueOnce({
					json: jest.fn().mockResolvedValue(mockRepos),
				});

			await getUserProfileAndRepos(req, res);

			expect(global.fetch).toHaveBeenCalledWith(
				'https://api.github.com/users/octocat',
				{
					headers: {
						authorization: 'token mock_api_key',
					},
				}
			);
			expect(global.fetch).toHaveBeenCalledWith(
				'https://api.github.com/users/octocat/repos',
				{
					headers: {
						authorization: 'token mock_api_key',
					},
				}
			);
			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.json).toHaveBeenCalledWith({
				userProfile: mockUserProfile,
				repos: mockRepos,
			});
		});

		it('should handle errors and return 500 status', async () => {
			req.params.username = 'octocat';
			global.fetch = jest.fn().mockRejectedValue(new Error('Fetch failed'));

			await getUserProfileAndRepos(req, res);

			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith({ error: 'Fetch failed' });
		});
	});

	describe('likeProfile', () => {
		it('should like a user profile successfully', async () => {
			req.params.username = 'janedoe';
			req.user = { _id: { toString: () => '123' } };

			const mockAuthUser = {
				username: 'johndoe',
				avatarUrl: 'https://example.com/avatar.jpg',
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

			expect(User.findById).toHaveBeenCalledWith('123');
			expect(User.findOne).toHaveBeenCalledWith({ username: 'janedoe' });
			expect(mockAuthUser.likedProfiles).toContain('janedoe');
			expect(mockUserToLike.likedBy).toHaveLength(1);
			expect(mockUserToLike.likedBy[0].username).toBe('johndoe');
			expect(mockAuthUser.save).toHaveBeenCalled();
			expect(mockUserToLike.save).toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.json).toHaveBeenCalledWith({ message: 'User liked' });
		});

		it('should return 404 if user to like is not found', async () => {
			req.params.username = 'nonexistent';
			req.user = { _id: { toString: () => '123' } };

			User.findById.mockResolvedValue({
				username: 'johndoe',
				likedProfiles: [],
			});
			User.findOne.mockResolvedValue(null);

			await likeProfile(req, res);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ error: 'User is not a member' });
		});

		it('should return 400 if user has already liked the profile', async () => {
			req.params.username = 'janedoe';
			req.user = { _id: { toString: () => '123' } };

			User.findById.mockResolvedValue({
				username: 'johndoe',
				likedProfiles: ['janedoe'],
			});
			User.findOne.mockResolvedValue({
				username: 'janedoe',
				likedBy: [],
			});

			await likeProfile(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ error: 'User already liked' });
		});

		it('should return 500 when database throws an error', async () => {
			req.params.username = 'janedoe';
			req.user = { _id: { toString: () => '123' } };

			User.findById.mockRejectedValue(new Error('Database error'));

			await likeProfile(req, res);

			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith({ error: 'Database error' });
		});
	});

	describe('getLikes', () => {
		it('should return likedBy array for authenticated user', async () => {
			req.user = { _id: { toString: () => '123' } };
			const mockLikes = [{ username: 'janedoe', avatarUrl: 'avatar.png' }];

			User.findById.mockResolvedValue({ likedBy: mockLikes });

			await getLikes(req, res);

			expect(User.findById).toHaveBeenCalledWith('123');
			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.json).toHaveBeenCalledWith({ likedBy: mockLikes });
		});

		it('should return 500 when an error occurs', async () => {
			req.user = { _id: { toString: () => '123' } };

			User.findById.mockRejectedValue(new Error('User not found error'));

			await getLikes(req, res);

			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith({ error: 'User not found error' });
		});
	});
});