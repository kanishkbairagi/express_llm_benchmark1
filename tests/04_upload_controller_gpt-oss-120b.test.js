import { jest } from '@jest/globals';
import {
  uploadImage,
  deleteImage,
  S3Service,
  FileRecord
} from '../dataset/04_upload_controller.js';

const createMockRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn()
});

describe('uploadImage controller', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should upload image successfully', async () => {
    const req = {
      file: {
        originalname: 'test_image.png',
        mimetype: 'image/png',
        size: 1024,
        buffer: Buffer.from('test')
      },
      user: { id: 'user_1' }
    };
    const res = createMockRes();

    await uploadImage(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Image uploaded successfully',
        data: expect.objectContaining({
          fileId: expect.any(String),
          url: expect.stringContaining('https://mock-s3-bucket.s3.amazonaws.com/'),
          size: req.file.size,
          mimetype: req.file.mimetype
        })
      })
    );
  });

  test('should return 400 when no file is provided', async () => {
    const req = { file: undefined };
    const res = createMockRes();

    await uploadImage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'No file uploaded. Form field "image" is required.'
      })
    );
  });

  test('should return 415 for unsupported mime type', async () => {
    const req = {
      file: {
        originalname: 'test.txt',
        mimetype: 'text/plain',
        size: 500,
        buffer: Buffer.from('test')
      }
    };
    const res = createMockRes();

    await uploadImage(req, res);

    expect(res.status).toHaveBeenCalledWith(415);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Unsupported media type')
      })
    );
  });

  test('should return 413 when file exceeds max size', async () => {
    const req = {
      file: {
        originalname: 'big.jpg',
        mimetype: 'image/jpeg',
        size: 6 * 1024 * 1024, // 6 MB
        buffer: Buffer.alloc(0)
      }
    };
    const res = createMockRes();

    await uploadImage(req, res);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('File exceeds maximum allowed size')
      })
    );
  });

  test('should return 500 on internal error', async () => {
    const req = {
      file: {
        originalname: 'error.png',
        mimetype: 'image/png',
        size: 1024,
        buffer: Buffer.from('test')
      }
    };
    const res = createMockRes();

    jest.spyOn(S3Service, 'upload').mockRejectedValueOnce(new Error('S3 failure'));

    await uploadImage(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Failed to upload image',
        details: 'S3 failure'
      })
    );
  });
});

describe('deleteImage controller', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should delete image successfully', async () => {
    const req = { params: { fileId: 'file_rec_123' } };
    const res = createMockRes();

    jest.spyOn(FileRecord, 'findById').mockResolvedValueOnce({
      s3Key: 'uploads/123-test.png'
    });
    jest.spyOn(S3Service, 'delete').mockResolvedValueOnce({ DeleteMarker: true });
    jest.spyOn(FileRecord, 'delete').mockResolvedValueOnce(true);

    await deleteImage(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'File deleted successfully',
        data: { fileId: req.params.fileId }
      })
    );
  });

  test('should return 400 when fileId param is missing', async () => {
    const req = { params: {} };
    const res = createMockRes();

    await deleteImage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'File ID parameter is required'
      })
    );
  });

  test('should return 404 when file not found', async () => {
    const req = { params: { fileId: 'nonexistent' } };
    const res = createMockRes();

    jest.spyOn(FileRecord, 'findById').mockResolvedValueOnce(null);

    await deleteImage(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('not found')
      })
    );
  });

  test('should return 500 on internal error during delete', async () => {
    const req = { params: { fileId: 'file_rec_123' } };
    const res = createMockRes();

    jest.spyOn(FileRecord, 'findById').mockResolvedValueOnce({
      s3Key: 'uploads/123-test.png'
    });
    jest.spyOn(S3Service, 'delete').mockRejectedValueOnce(new Error('S3 delete error'));

    await deleteImage(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Failed to delete file',
        details: 'S3 delete error'
      })
    );
  });
});