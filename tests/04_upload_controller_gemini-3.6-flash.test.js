import { jest } from '@jest/globals';
import { uploadImage, deleteImage, S3Service, FileRecord } from '../dataset/04_upload_controller.js';

describe('Upload Controller', () => {
  let mockRes;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  describe('uploadImage', () => {
    const validFile = {
      originalname: 'test-image.jpg',
      mimetype: 'image/jpeg',
      size: 1024 * 1024, // 1MB
      buffer: Buffer.from('fake-image-bytes')
    };

    test('should return 400 if no file is provided', async () => {
      const req = {};

      await uploadImage(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'No file uploaded. Form field "image" is required.'
      });
    });

    test('should return 415 if mimetype is not allowed', async () => {
      const req = {
        file: { ...validFile, mimetype: 'application/pdf' }
      };

      await uploadImage(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(415);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unsupported media type: application/pdf. Allowed types: image/jpeg, image/png, image/webp'
      });
    });

    test('should return 413 if file exceeds maximum size', async () => {
      const req = {
        file: { ...validFile, size: 6 * 1024 * 1024 } // 6MB
      };

      await uploadImage(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(413);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'File exceeds maximum allowed size of 5MB'
      });
    });

    test('should successfully upload image for an authenticated user', async () => {
      const req = {
        file: validFile,
        user: { id: 'user_123' }
      };

      jest.spyOn(S3Service, 'upload').mockResolvedValue({
        Location: 'https://mock-s3-bucket.s3.amazonaws.com/uploads/123-test-image.jpg',
        Key: 'uploads/123-test-image.jpg',
        Bucket: 'mock-s3-bucket'
      });

      jest.spyOn(FileRecord, 'create').mockResolvedValue({
        id: 'file_rec_999',
        originalName: 'test-image.jpg',
        s3Key: 'uploads/123-test-image.jpg',
        url: 'https://mock-s3-bucket.s3.amazonaws.com/uploads/123-test-image.jpg',
        size: 1024 * 1024,
        mimetype: 'image/jpeg',
        uploadedBy: 'user_123',
        createdAt: new Date()
      });

      await uploadImage(req, mockRes);

      expect(S3Service.upload).toHaveBeenCalled();
      expect(FileRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          originalName: 'test-image.jpg',
          s3Key: 'uploads/123-test-image.jpg',
          uploadedBy: 'user_123'
        })
      );
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Image uploaded successfully',
        data: {
          fileId: 'file_rec_999',
          url: 'https://mock-s3-bucket.s3.amazonaws.com/uploads/123-test-image.jpg',
          size: 1024 * 1024,
          mimetype: 'image/jpeg'
        }
      });
    });

    test('should fallback to "anonymous" if req.user is undefined', async () => {
      const req = {
        file: validFile
      };

      const createSpy = jest.spyOn(FileRecord, 'create');

      await uploadImage(req, mockRes);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          uploadedBy: 'anonymous'
        })
      );
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    test('should return 500 if S3 upload fails', async () => {
      const req = { file: validFile };
      jest.spyOn(S3Service, 'upload').mockRejectedValue(new Error('S3 Error'));

      await uploadImage(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to upload image',
        details: 'S3 Error'
      });
    });
  });

  describe('deleteImage', () => {
    test('should return 400 if fileId parameter is missing', async () => {
      const req = { params: {} };

      await deleteImage(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'File ID parameter is required'
      });
    });

    test('should return 404 if file is not found in database', async () => {
      const req = { params: { fileId: 'non_existent_id' } };
      jest.spyOn(FileRecord, 'findById').mockResolvedValue(null);

      await deleteImage(req, mockRes);

      expect(FileRecord.findById).toHaveBeenCalledWith('non_existent_id');
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'File with ID non_existent_id not found'
      });
    });

    test('should successfully delete file from S3 and database', async () => {
      const req = { params: { fileId: 'file_123' } };
      const mockRecord = {
        id: 'file_123',
        s3Key: 'uploads/file_123.jpg'
      };

      jest.spyOn(FileRecord, 'findById').mockResolvedValue(mockRecord);
      jest.spyOn(S3Service, 'delete').mockResolvedValue({ DeleteMarker: true });
      jest.spyOn(FileRecord, 'delete').mockResolvedValue(true);

      await deleteImage(req, mockRes);

      expect(FileRecord.findById).toHaveBeenCalledWith('file_123');
      expect(S3Service.delete).toHaveBeenCalledWith('uploads/file_123.jpg');
      expect(FileRecord.delete).toHaveBeenCalledWith('file_123');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'File deleted successfully',
        data: { fileId: 'file_123' }
      });
    });

    test('should return 500 if an error occurs during deletion', async () => {
      const req = { params: { fileId: 'file_123' } };
      jest.spyOn(FileRecord, 'findById').mockRejectedValue(new Error('DB Connection Error'));

      await deleteImage(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to delete file',
        details: 'DB Connection Error'
      });
    });
  });
});