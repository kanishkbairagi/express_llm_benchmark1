import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import {
  getProfiles,
  getProfile,
  createProfile,
  getProfilesByUser,
  getProfilesBySearch,
  updateProfile,
  deleteProfile,
} from '../dataset/external/panshak__accountill/server/controllers/profile.js';

// Mock ProfileModel
jest.mock('../dataset/external/panshak__accountill/server/models/ProfileModel.js', () => ({
  __esModule: true,
  default: {
    find: jest.fn(),
    findById: jest.fn(),
    findOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndRemove: jest.fn(),
    save: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
    create: jest.fn(),
    insertMany: jest.fn(),
    // Used in createProfile
    findOne: jest.fn(),
    // Used in createProfile new instance
    prototype: {
      save: jest.fn(),
    },
  },
}));

// Mock mongoose ObjectId validation
jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockImplementation((id) => id === 'valid-id');

// Helper to build mock response
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

describe('Profile Controllers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getProfiles', () => {
    it('should return all profiles with status 200', async () => {
      const mockProfiles = [{ name: 'A' }, { name: 'B' }];
      const ProfileModel = (await import('../dataset/external/panshak__accountill/server/models/ProfileModel.js')).default;
      ProfileModel.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockProfiles),
      });

      const req = {};
      const res = mockResponse();

      await getProfiles(req, res);

      expect(ProfileModel.find).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockProfiles);
    });

    it('should handle errors with status 404', async () => {
      const ProfileModel = (await import('../dataset/external/panshak__accountill/server/models/ProfileModel.js')).default;
      ProfileModel.find.mockImplementation(() => {
        throw new Error('DB error');
      });

      const req = {};
      const res = mockResponse();

      await getProfiles(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'DB error' });
    });
  });

  describe('getProfile', () => {
    it('should return a single profile with status 200', async () => {
      const mockProfile = { _id: '123', name: 'John' };
      const ProfileModel = (await import('../dataset/external/panshak__accountill/server/models/ProfileModel.js')).default;
      ProfileModel.findById.mockResolvedValue(mockProfile);

      const req = { params: { id: '123' } };
      const res = mockResponse();

      await getProfile(req, res);

      expect(ProfileModel.findById).toHaveBeenCalledWith('123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockProfile);
    });

    it('should handle errors with status 404', async () => {
      const ProfileModel = (await import('../dataset/external/panshak__accountill/server/models/ProfileModel.js')).default;
      ProfileModel.findById.mockImplementation(() => {
        throw new Error('Not found');
      });

      const req = { params: { id: 'bad' } };
      const res = mockResponse();

      await getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Not found' });
    });
  });

  describe('createProfile', () => {
    const baseBody = {
      name: 'Test',
      email: 'test@example.com',
      phoneNumber: '123456',
      businessName: 'Biz',
      contactAddress: 'Addr',
      logo: 'logo.png',
      website: 'https://example.com',
      userId: 'uid123',
    };

    it('should create a profile when email is unique', async () => {
      const ProfileModel = (await import('../dataset/external/panshak__accountill/server/models/ProfileModel.js')).default;
      ProfileModel.findOne.mockResolvedValue(null);
      const saveMock = jest.fn().mockResolvedValue({});
      // Mock the constructor to return an object with save method
      const MockedProfile = function (data) {
        this.save = saveMock;
        Object.assign(this, data);
      };
      // Replace default export's prototype with mocked constructor
      ProfileModel.mockImplementation = MockedProfile;

      const req = { body: baseBody };
      const res = mockResponse();

      await createProfile(req, res);

      expect(ProfileModel.findOne).toHaveBeenCalledWith({ email: baseBody.email });
      expect(saveMock).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ email: baseBody.email }));
    });

    it('should return 404 when profile already exists', async () => {
      const ProfileModel = (await import('../dataset/external/panshak__accountill/server/models/ProfileModel.js')).default;
      ProfileModel.findOne.mockResolvedValue({ email: baseBody.email });

      const req = { body: baseBody };
      const res = mockResponse();

      await createProfile(req, res);

      expect(ProfileModel.findOne).toHaveBeenCalledWith({ email: baseBody.email });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Profile already exist' });
    });

    it('should handle save errors with status 409', async () => {
      const ProfileModel = (await import('../dataset/external/panshak__accountill/server/models/ProfileModel.js')).default;
      ProfileModel.findOne.mockResolvedValue(null);
      const saveMock = jest.fn().mockRejectedValue(new Error('Save failed'));
      const MockedProfile = function (data) {
        this.save = saveMock;
        Object.assign(this, data);
      };
      ProfileModel.mockImplementation = MockedProfile;

      const req = { body: baseBody };
      const res = mockResponse();

      await createProfile(req, res);

      expect(saveMock).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ message: 'Save failed' });
    });
  });

  describe('getProfilesByUser', () => {
    it('should return profile matching userId', async () => {
      const mockProfile = { userId: 'uid123' };
      const ProfileModel = (await import('../dataset/external/panshak__accountill/server/models/ProfileModel.js')).default;
      ProfileModel.findOne.mockResolvedValue(mockProfile);

      const req = { query: { searchQuery: 'uid123' } };
      const res = mockResponse();

      await getProfilesByUser(req, res);

      expect(ProfileModel.findOne).toHaveBeenCalledWith({ userId: 'uid123' });
      expect(res.json).toHaveBeenCalledWith({ data: mockProfile });
    });

    it('should handle errors with status 404', async () => {
      const ProfileModel = (await import('../dataset/external/panshak__accountill/server/models/ProfileModel.js')).default;
      ProfileModel.findOne.mockImplementation(() => {
        throw new Error('Lookup error');
      });

      const req = { query: { searchQuery: 'uid123' } };
      const res = mockResponse();

      await getProfilesByUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Lookup error' });
    });
  });

  describe('getProfilesBySearch', () => {
    it('should return profiles matching name or email regex', async () => {
      const mockProfiles = [{ name: 'Alice' }, { email: 'bob@example.com' }];
      const ProfileModel = (await import('../dataset/external/panshak__accountill/server/models/ProfileModel.js')).default;
      ProfileModel.find.mockResolvedValue(mockProfiles);

      const req = { query: { searchQuery: 'a' } };
      const res = mockResponse();

      await getProfilesBySearch(req, res);

      expect(ProfileModel.find).toHaveBeenCalledWith({
        $or: [{ name: expect.any(RegExp) }, { email: expect.any(RegExp) }],
      });
      expect(res.json).toHaveBeenCalledWith({ data: mockProfiles });
    });

    it('should handle errors with status 404', async () => {
      const ProfileModel = (await import('../dataset/external/panshak__accountill/server/models/ProfileModel.js')).default;
      ProfileModel.find.mockImplementation(() => {
        throw new Error('Search error');
      });

      const req = { query: { searchQuery: 'test' } };
      const res = mockResponse();

      await getProfilesBySearch(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Search error' });
    });
  });

  describe('updateProfile', () => {
    it('should return 404 for invalid ObjectId', async () => {
      const req = { params: { id: 'invalid-id' }, body: { name: 'New' } };
      const res = mockResponse();

      await updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith('No client with that id');
    });

    it('should update and return the updated profile', async () => {
      const updated = { _id: 'valid-id', name: 'Updated' };
      const ProfileModel = (await import('../dataset/external/panshak__accountill/server/models/ProfileModel.js')).default;
      ProfileModel.findByIdAndUpdate.mockResolvedValue(updated);

      const req = { params: { id: 'valid-id' }, body: { name: 'Updated' } };
      const res = mockResponse();

      await updateProfile(req, res);

      expect(ProfileModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'valid-id',
        { name: 'Updated', _id: 'valid-id' },
        { new: true }
      );
      expect(res.json).toHaveBeenCalledWith(updated);
    });
  });

  describe('deleteProfile', () => {
    it('should return 404 for invalid ObjectId', async () => {
      const req = { params: { id: 'bad' } };
      const res = mockResponse();

      await deleteProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith('No profile with id: bad');
    });

    it('should delete the profile and return success message', async () => {
      const ProfileModel = (await import('../dataset/external/panshak__accountill/server/models/ProfileModel.js')).default;
      ProfileModel.findByIdAndRemove.mockResolvedValue({});

      const req = { params: { id: 'valid-id' } };
      const res = mockResponse();

      await deleteProfile(req, res);

      expect(ProfileModel.findByIdAndRemove).toHaveBeenCalledWith('valid-id');
      expect(res.json).toHaveBeenCalledWith({ message: 'Profile deleted successfully.' });
    });
  });
});