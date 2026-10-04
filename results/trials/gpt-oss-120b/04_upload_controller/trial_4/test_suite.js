import { jest } from '@jest/globals';
import {
  uploadImage,
  deleteImage,
  S3Service,
  FileRecord
} from '../dataset/04_upload_controller.js';

const createRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('uploadImage controller', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should upload image successfully', async () => {
    const mockFile = {
      originalname: 'my photo.png',
      mimetype: 'image/png',
      size: 1024,
      buffer: Buffer.from('test')
    };
    const req = { file: mockFile, user: { id: 'user_1' } };
    const res = createRes();

    const uploadMock = jest
      .spyOn(S3Service, 'upload')
      .mockResolvedValue({
        Location: 'https://mock-s3-bucket.s3.amazonaws.com/uploads/12345-my_photo.png',
        Key: 'uploads/12345-my_photo.png',
        Bucket: 'mock-s3-bucket'
      });

    const createMock = jest
      .spyOn(FileRecord, 'create')
      .mockImplementation(async (data) => ({
        id: 'file_rec_123',
        ...data,
        createdAt: new Date()
      }));

    await uploadImage(req, res);

    expect(uploadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        buffer: mockFile.buffer,
        originalname: mockFile.originalname,
        mimetype: mockFile.mimetype,
        key: expect.stringContaining('uploads/')
      })
    );

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        originalName: mockFile.originalname,
        s3Key: expect.any(String),
        url: expect.any(String),
        size: mockFile.size,
        mimetype: mockFile.mimetype,
        uploadedBy: 'user_1'
      })
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Image uploaded successfully',
        data: expect.objectContaining({
          fileId: 'file_rec_123',
          url: expect.any(String),
          size: mockFile.size,
          mimetype: mockFile.mimetype
        })
      })
    );
  });

  test('should return 400 when no file is provided', async () => {
    const req = { file: undefined };
    const res = createRes();

    await uploadImage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'No file uploaded. Form field "image" is required.'
    });
  });

  test('should return 415 for unsupported mime type', async () => {
    const req = {
      file: {
        originalname: 'doc.txt',
        mimetype: 'text/plain',
        size: 100,
        buffer: Buffer.from('test')
      }
    };
    const res = createRes();

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
        size: 6 * 1024 * 1024, // 6MB
        buffer: Buffer.alloc(6 * 1024 * 1024)
      }
    };
    const res = createRes();

    await uploadImage(req, res);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('File exceeds maximum allowed size')
      })
    );
  });

  test('should handle internal errors and return 500', async () => {
    const mockFile = {
      originalname: 'photo.jpg',
      mimetype: 'image/jpeg',
      size: 1024,
      buffer: Buffer.from('test')
    };
    const req = { file: mockFile };
    const res = createRes();

    jest.spyOn(S3Service, 'upload').mockRejectedValue(new Error('S3 failure'));

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
    const res = createRes();

    const fileRecord = {
      id: 'file_rec_123',
      s3Key: 'uploads/abc.png'
    };

    jest.spyOn(FileRecord, 'findById').mockResolvedValue(fileRecord);
    const deleteS3Mock = jest.spyOn(S3Service, 'delete').mockResolvedValue({});
    const deleteRecordMock = jest.spyOn(FileRecord, 'delete').mockResolvedValue(true);

    await deleteImage(req, res);

    expect(FileRecord.findById).toHaveBeenCalledWith('file_rec_123');
    expect(deleteS3Mock).toHaveBeenCalledWith(fileRecord.s3Key);
    expect(deleteRecordMock).toHaveBeenCalledWith('file_rec_123');

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'File deleted successfully',
        data: { fileId: 'file_rec_123' }
      })
    );
  });

  test('should return 400 when fileId param is missing', async () => {
    const req = { params: {} };
    const res = createRes();

    await deleteImage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'File ID parameter is required'
    });
  });

  test('should return 404 when file not found', async () => {
    const req = { params: { fileId: 'nonexistent' } };
    const res = createRes();

    jest.spyOn(FileRecord, 'findById').mockResolvedValue(null);

    await deleteImage(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('not found')
      })
    );
  });

  test('should handle internal errors and return 500', async () => {
    const req = { params: { fileId: 'file_rec_123' } };
    const res = createRes();

    jest.spyOn(FileRecord, 'findById').mockResolvedValue({
      id: 'file_rec_123',
      s3Key: 'uploads/xyz.png'
    });
    jest.spyOn(S3Service, 'delete').mockRejectedValue(new Error('S3 delete error'));

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