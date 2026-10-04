import {
  uploadImage,
  deleteImage,
  S3Service,
  FileRecord
} from '../dataset/04_upload_controller.js';
import { jest } from '@jest/globals';

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('04_upload_controller unit tests', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('S3Service and FileRecord default implementations', () => {
    it('S3Service.upload should return mock location and key', async () => {
      const result = await S3Service.upload({ key: 'test.jpg' });
      expect(result).toEqual({
        Location: 'https://mock-s3-bucket.s3.amazonaws.com/test.jpg',
        Key: 'test.jpg',
        Bucket: 'mock-s3-bucket'
      });
    });

    it('S3Service.delete should return delete response', async () => {
      const result = await S3Service.delete('test.jpg');
      expect(result).toEqual({
        DeleteMarker: true,
        VersionId: 'mock-version-id'
      });
    });

    it('FileRecord.create should return a record object', async () => {
      const result = await FileRecord.create({ originalName: 'file.jpg' });
      expect(result.id).toBe('file_rec_123');
      expect(result.originalName).toBe('file.jpg');
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('FileRecord.findById should default to returning null', async () => {
      const result = await FileRecord.findById('file_rec_123');
      expect(result).toBeNull();
    });

    it('FileRecord.delete should return true', async () => {
      const result = await FileRecord.delete('file_rec_123');
      expect(result).toBe(true);
    });
  });

  describe('uploadImage', () => {
    it('should return 400 when no file is present in req', async () => {
      const req = {};
      const res = createMockRes();

      await uploadImage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'No file uploaded. Form field "image" is required.'
      });
    });

    it('should return 415 when file has unsupported mime type', async () => {
      const req = {
        file: {
          originalname: 'document.pdf',
          mimetype: 'application/pdf',
          size: 1024,
          buffer: Buffer.from('pdf data')
        }
      };
      const res = createMockRes();

      await uploadImage(req, res);

      expect(res.status).toHaveBeenCalledWith(415);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unsupported media type: application/pdf. Allowed types: image/jpeg, image/png, image/webp'
      });
    });

    it('should return 413 when file size exceeds MAX_FILE_SIZE (5MB)', async () => {
      const req = {
        file: {
          originalname: 'large.png',
          mimetype: 'image/png',
          size: 6 * 1024 * 1024, // 6MB
          buffer: Buffer.from('large file')
        }
      };
      const res = createMockRes();

      await uploadImage(req, res);

      expect(res.status).toHaveBeenCalledWith(413);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'File exceeds maximum allowed size of 5MB'
      });
    });

    it('should successfully upload valid file for authenticated user', async () => {
      const req = {
        file: {
          originalname: 'avatar photo.png',
          mimetype: 'image/png',
          size: 1000,
          buffer: Buffer.from('fake image binary')
        },
        user: { id: 'usr_999' }
      };
      const res = createMockRes();

      await uploadImage(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Image uploaded successfully',
        data: {
          fileId: 'file_rec_123',
          url: expect.stringContaining('https://mock-s3-bucket.s3.amazonaws.com/uploads/'),
          size: 1000,
          mimetype: 'image/png'
        }
      });
    });

    it('should successfully upload valid file for anonymous user when req.user is missing', async () => {
      const req = {
        file: {
          originalname: 'sample.jpeg',
          mimetype: 'image/jpeg',
          size: 2000,
          buffer: Buffer.from('fake image binary')
        }
      };
      const res = createMockRes();

      const createSpy = jest.spyOn(FileRecord, 'create');

      await uploadImage(req, res);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          uploadedBy: 'anonymous'
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should return 500 when an error is thrown during process', async () => {
      const req = {
        file: {
          originalname: 'test.webp',
          mimetype: 'image/webp',
          size: 500,
          buffer: Buffer.from('webp')
        }
      };
      const res = createMockRes();

      jest.spyOn(S3Service, 'upload').mockRejectedValueOnce(new Error('S3 connection failed'));

      await uploadImage(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to upload image',
        details: 'S3 connection failed'
      });
    });
  });

  describe('deleteImage', () => {
    it('should return 400 when fileId parameter is missing or req.params is empty', async () => {
      const req = { params: {} };
      const res = createMockRes();

      await deleteImage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'File ID parameter is required'
      });
    });

    it('should return 400 when req.params is undefined', async () => {
      const req = {};
      const res = createMockRes();

      await deleteImage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'File ID parameter is required'
      });
    });

    it('should return 404 when file is not found in database', async () => {
      const req = { params: { fileId: 'non_existent_id' } };
      const res = createMockRes();

      jest.spyOn(FileRecord, 'findById').mockResolvedValueOnce(null);

      await deleteImage(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'File with ID non_existent_id not found'
      });
    });

    it('should successfully delete file from S3 and database when file exists', async () => {
      const req = { params: { fileId: 'file_rec_123' } };
      const res = createMockRes();

      const mockFileRecord = {
        id: 'file_rec_123',
        s3Key: 'uploads/123-test.png',
        url: 'https://mock-s3-bucket.s3.amazonaws.com/uploads/123-test.png'
      };

      jest.spyOn(FileRecord, 'findById').mockResolvedValueOnce(mockFileRecord);
      const s3DeleteSpy = jest.spyOn(S3Service, 'delete').mockResolvedValueOnce({});
      const dbDeleteSpy = jest.spyOn(FileRecord, 'delete').mockResolvedValueOnce(true);

      await deleteImage(req, res);

      expect(s3DeleteSpy).toHaveBeenCalledWith('uploads/123-test.png');
      expect(dbDeleteSpy).toHaveBeenCalledWith('file_rec_123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'File deleted successfully',
        data: { fileId: 'file_rec_123' }
      });
    });

    it('should return 500 when database or S3 operation throws an error', async () => {
      const req = { params: { fileId: 'file_rec_123' } };
      const res = createMockRes();

      jest.spyOn(FileRecord, 'findById').mockRejectedValueOnce(new Error('Database error'));

      await deleteImage(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to delete file',
        details: 'Database error'
      });
    });
  });
});