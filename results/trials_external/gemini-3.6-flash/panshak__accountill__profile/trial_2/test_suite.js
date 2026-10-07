import { jest } from '@jest/globals';
import mongoose from 'mongoose';

jest.mock('../models/ProfileModel.js', () => {
  const mockModelConstructor = jest.fn().mockImplementation((data) => ({
    ...data,
    save: jest.fn().mockResolvedValue(data)
  }));

  mockModelConstructor.find = jest.fn();
  mockModelConstructor.findById = jest.fn();
  mockModelConstructor.findOne = jest.fn();
  mockModelConstructor.findByIdAndUpdate = jest.fn();
  mockModelConstructor.findByIdAndRemove = jest.fn();

  return {
    __esModule: true,
    default: mockModelConstructor
  };
});

import ProfileModel from '../models/ProfileModel.js';
import {
  getProfiles,
  getProfile,
  createProfile,
  getProfilesByUser,
  getProfilesBySearch,
  updateProfile,
  deleteProfile
} from '../dataset/external/panshak__accountill/server/controllers/profile.js';

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

describe('Profile Controller', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('getProfiles', () => {
    it('should return 200 and all profiles sorted by _id descending', async () => {
      const mockProfiles = [{ name: 'User 1' }, { name: 'User 2' }];
      ProfileModel.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockProfiles)
      });

      const req = {};
      const res = createMockRes();

      await getProfiles(req, res);

      expect(ProfileModel.find).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockProfiles);
    });

    it('should return 404 when an error occurs', async () => {
      ProfileModel.find.mockReturnValue({
        sort: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      const req = {};
      const res = createMockRes();

      await getProfiles(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Database error' });
    });
  });

  describe('getProfile', () => {
    it('should return 200 and the matching profile', async () => {
      const mockProfile = { _id: '123', name: 'John Doe' };
      ProfileModel.findById.mockResolvedValue(mockProfile);

      const req = { params: { id: '123' } };
      const res = createMockRes();

      await getProfile(req, res);

      expect(ProfileModel.findById).toHaveBeenCalledWith('123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockProfile);
    });

    it('should return 404 when profile search fails', async () => {
      ProfileModel.findById.mockRejectedValue(new Error('Profile not found'));

      const req = { params: { id: 'invalid_id' } };
      const res = createMockRes();

      await getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Profile not found' });
    });
  });

  describe('createProfile', () => {
    it('should return 404 if profile with email already exists', async () => {
      ProfileModel.findOne.mockResolvedValue({ email: 'existing@example.com' });

      const req = {
        body: {
          name: 'Existing User',
          email: 'existing@example.com'
        }
      };
      const res = createMockRes();

      await createProfile(req, res);

      expect(ProfileModel.findOne).toHaveBeenCalledWith({ email: 'existing@example.com' });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Profile already exist' });
    });

    it('should create new profile and return 201', async () => {
      ProfileModel.findOne.mockResolvedValue(null);

      const req = {
        body: {
          name: 'New User',
          email: 'new@example.com',
          phoneNumber: '1234567890',
          businessName: 'Biz',
          contactAddress: 'Address',
          logo: 'logo.png',
          website: 'example.com',
          userId: 'user123'
        }
      };
      const res = createMockRes();

      await createProfile(req, res);

      expect(ProfileModel.findOne).toHaveBeenCalledWith({ email: 'new@example.com' });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New User',
          email: 'new@example.com',
          userId: 'user123'
        })
      );
    });

    it('should return 409 when an error occurs during creation', async () => {
      ProfileModel.findOne.mockRejectedValue(new Error('Conflict error'));

      const req = { body: { email: 'test@example.com' } };
      const res = createMockRes();

      await createProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ message: 'Conflict error' });
    });
  });

  describe('getProfilesByUser', () => {
    it('should return matching profile data for given userId searchQuery', async () => {
      const mockProfile = { name: 'User Profile', userId: 'user123' };
      ProfileModel.findOne.mockResolvedValue(mockProfile);

      const req = { query: { searchQuery: 'user123' } };
      const res = createMockRes();

      await getProfilesByUser(req, res);

      expect(ProfileModel.findOne).toHaveBeenCalledWith({ userId: 'user123' });
      expect(res.json).toHaveBeenCalledWith({ data: mockProfile });
    });

    it('should return 404 if finding profile by user throws error', async () => {
      ProfileModel.findOne.mockRejectedValue(new Error('Search failed'));

      const req = { query: { searchQuery: 'user123' } };
      const res = createMockRes();

      await getProfilesByUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Search failed' });
    });
  });

  describe('getProfilesBySearch', () => {
    it('should return matching profiles by name or email query', async () => {
      const mockProfiles = [{ name: 'John' }];
      ProfileModel.find.mockResolvedValue(mockProfiles);

      const req = { query: { searchQuery: 'John' } };
      const res = createMockRes();

      await getProfilesBySearch(req, res);

      expect(ProfileModel.find).toHaveBeenCalledWith({
        $or: [{ name: expect.any(RegExp) }, { email: expect.any(RegExp) }]
      });
      expect(res.json).toHaveBeenCalledWith({ data: mockProfiles });
    });

    it('should return 404 if search query throws error', async () => {
      ProfileModel.find.mockRejectedValue(new Error('Search error'));

      const req = { query: { searchQuery: 'John' } };
      const res = createMockRes();

      await getProfilesBySearch(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Search error' });
    });
  });

  describe('updateProfile', () => {
    it('should return 404 if provided id is invalid ObjectId', async () => {
      jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockReturnValue(false);

      const req = { params: { id: 'invalid_id' }, body: {} };
      const res = createMockRes();

      await updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith('No client with that id');
    });

    it('should update profile and return json when id is valid', async () => {
      jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockReturnValue(true);
      const updatedProfile = { _id: '507f1f77bcf86cd799439011', name: 'Updated' };
      ProfileModel.findByIdAndUpdate.mockResolvedValue(updatedProfile);

      const req = {
        params: { id: '507f1f77bcf86cd799439011' },
        body: { name: 'Updated' }
      };
      const res = createMockRes();

      await updateProfile(req, res);

      expect(ProfileModel.findByIdAndUpdate).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        { name: 'Updated', _id: '507f1f77bcf86cd799439011' },
        { new: true }
      );
      expect(res.json).toHaveBeenCalledWith(updatedProfile);
    });
  });

  describe('deleteProfile', () => {
    it('should return 404 if provided id is invalid ObjectId', async () => {
      jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockReturnValue(false);

      const req = { params: { id: 'invalid_id' } };
      const res = createMockRes();

      await deleteProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith('No profile with id: invalid_id');
    });

    it('should remove profile and return success message when id is valid', async () => {
      jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockReturnValue(true);
      ProfileModel.findByIdAndRemove.mockResolvedValue({});

      const req = { params: { id: '507f1f77bcf86cd799439011' } };
      const res = createMockRes();

      await deleteProfile(req, res);

      expect(ProfileModel.findByIdAndRemove).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(res.json).toHaveBeenCalledWith({ message: 'Profile deleted successfully.' });
    });
  });
});