import { jest } from '@jest/globals';
import { PassThrough } from 'node:stream';

const mockOpenUploadStream = jest.fn();
const mockOpenDownloadStream = jest.fn();
const mockFind = jest.fn();
const mockDelete = jest.fn();
const mockCreateFromHexString = jest.fn((id) => `ObjectId(${id})`);

class MockGridFSBucket {
  constructor(db, options) {
    this.db = db;
    this.options = options;
  }
  openUploadStream(...args) {
    return mockOpenUploadStream(...args);
  }
  openDownloadStream(...args) {
    return mockOpenDownloadStream(...args);
  }
  find(...args) {
    return mockFind(...args);
  }
  delete(...args) {
    return mockDelete(...args);
  }
}

jest.unstable_mockModule('mongodb', () => ({
  default: {
    GridFSBucket: MockGridFSBucket,
    ObjectId: {
      createFromHexString: mockCreateFromHexString,
    },
  },
}));

const { default: routes } = await import('../dataset/external/mongo-express__mongo-express/lib/routes/gridfs.js');

describe('gridfs routes', () => {
  let exp;
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    exp = routes();

    req = {
      db: {},
      bucketName: 'testBucket',
      dbName: 'testDb',
      session: {},
      get: jest.fn(),
      csrfToken: jest.fn().mockReturnValue('csrf-token-123'),
    };

    res = {
      locals: {
        gridFSBuckets: {
          testDb: ['testBucket'],
        },
      },
      render: jest.fn(),
      redirect: jest.fn(),
      set: jest.fn(),
      end: jest.fn(),
    };
  });

  describe('viewBucket', () => {
    test('renders viewBucket with correct columns, statistics, and processed files', () => {
      req.connFiles = [
        {
          _id: '1',
          filename: 'file1.txt',
          length: 1024,
          chunkSize: 512,
          metadata: { contentType: 'text/plain' },
        },
        {
          _id: '2',
          filename: 'file2.png',
          length: 2048,
          chunkSize: 512,
          contentType: 'image/png',
          metadata: { author: 'admin' },
        },
      ];

      exp.viewBucket(req, res);

      expect(res.render).toHaveBeenCalledTimes(1);
      const [view, ctx] = res.render.mock.calls[0];

      expect(view).toBe('gridfs');
      expect(ctx.title).toBe('Viewing Bucket: testBucket');
      expect(ctx.csrfToken).toBe('csrf-token-123');
      expect(ctx.buckets).toEqual(['testBucket']);
      expect(ctx.columns).toContain('filename');
      expect(ctx.columns).toContain('length');
      expect(ctx.columns).toContain('contentType');
      expect(ctx.columns).not.toContain('_id');
      expect(ctx.columns).not.toContain('chunkSize');

      expect(req.connFiles[0].contentType).toBe('text/plain');
      expect(req.connFiles[0].metadata).toBeUndefined();
      expect(req.connFiles[0].chunkSize).toBeUndefined();

      expect(req.connFiles[1].contentType).toBe('image/png');
      expect(req.connFiles[1].metadata).toEqual({ author: 'admin' });
      expect(req.connFiles[1].chunkSize).toBeUndefined();
    });
  });

  describe('addFile', () => {
    test('redirects with error if no file uploaded', async () => {
      req.files = null;
      req.get.mockReturnValue('http://localhost/previous');

      await exp.addFile(req, res);

      expect(req.session.error).toBe('No file uploaded!');
      expect(res.redirect).toHaveBeenCalledWith('http://localhost/previous');
    });

    test('redirects with default path if referrer is not present and no file uploaded', async () => {
      req.files = {};
      req.get.mockReturnValue(undefined);

      await exp.addFile(req, res);

      expect(req.session.error).toBe('No file uploaded!');
      expect(res.redirect).toHaveBeenCalledWith('/');
    });

    test('uploads file successfully', async () => {
      req.files = {
        filefield: {
          data: Buffer.from('hello world'),
          name: 'test.txt',
          mimetype: 'text/plain',
        },
      };
      req.get.mockReturnValue('http://localhost/referrer');

      const uploadStream = new PassThrough();
      mockOpenUploadStream.mockReturnValue(uploadStream);

      const promise = exp.addFile(req, res);
      await promise;

      expect(mockOpenUploadStream).toHaveBeenCalledWith('test.txt', {
        metadata: { contentType: 'text/plain' },
      });
      expect(req.session.success).toBe('File uploaded!');
      expect(res.redirect).toHaveBeenCalledWith('http://localhost/referrer');
    });

    test('handles upload stream error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      req.files = {
        filefield: {
          data: Buffer.from('data'),
          name: 'fail.txt',
          mimetype: 'text/plain',
        },
      };

      const uploadStream = new PassThrough();
      mockOpenUploadStream.mockReturnValue(uploadStream);

      process.nextTick(() => {
        uploadStream.emit('error', new Error('Stream failed'));
      });

      await exp.addFile(req, res);

      expect(req.session.error).toBe('Could not upload the file! Error: Stream failed');
      expect(res.redirect).toHaveBeenCalledWith('/');
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getFile', () => {
    test('redirects with error if file is not found', async () => {
      req.fileID = '123456789012345678901234';
      const mockToArray = jest.fn().mockResolvedValue([]);
      mockFind.mockReturnValue({
        limit: jest.fn().mockReturnValue({
          toArray: mockToArray,
        }),
      });

      await exp.getFile(req, res);

      expect(mockCreateFromHexString).toHaveBeenCalledWith('123456789012345678901234');
      expect(req.session.error).toBe('File not found!');
      expect(res.redirect).toHaveBeenCalledWith('/');
    });

    test('streams file with appropriate content headers when file is found', async () => {
      req.fileID = '123456789012345678901234';
      const fileData = {
        filename: 'my document.pdf',
        metadata: { contentType: 'application/pdf' },
      };

      const mockToArray = jest.fn().mockResolvedValue([fileData]);
      mockFind.mockReturnValue({
        limit: jest.fn().mockReturnValue({
          toArray: mockToArray,
        }),
      });

      const downloadStream = new PassThrough();
      mockOpenDownloadStream.mockReturnValue(downloadStream);

      const resStream = new PassThrough();
      resStream.set = res.set;
      resStream.end = res.end;

      await exp.getFile(req, resStream);

      expect(res.set).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.set).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="my%20document.pdf"',
      );
      expect(mockOpenDownloadStream).toHaveBeenCalledWith('ObjectId(123456789012345678901234)');
    });

    test('uses fallback content-type if missing in metadata and top-level', async () => {
      req.fileID = '123456789012345678901234';
      const fileData = { filename: 'unknown.bin' };

      const mockToArray = jest.fn().mockResolvedValue([fileData]);
      mockFind.mockReturnValue({
        limit: jest.fn().mockReturnValue({
          toArray: mockToArray,
        }),
      });

      const downloadStream = new PassThrough();
      mockOpenDownloadStream.mockReturnValue(downloadStream);

      const resStream = new PassThrough();
      resStream.set = res.set;

      await exp.getFile(req, resStream);

      expect(res.set).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
    });

    test('handles error on download stream', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      req.fileID = '123456789012345678901234';
      const fileData = { filename: 'error.txt', contentType: 'text/plain' };

      const mockToArray = jest.fn().mockResolvedValue([fileData]);
      mockFind.mockReturnValue({
        limit: jest.fn().mockReturnValue({
          toArray: mockToArray,
        }),
      });

      const downloadStream = new PassThrough();
      mockOpenDownloadStream.mockReturnValue(downloadStream);

      const resStream = new PassThrough();
      resStream.set = res.set;
      resStream.end = res.end;

      await exp.getFile(req, resStream);

      downloadStream.emit('error', new Error('Read error'));

      expect(req.session.error).toBe('Error: Error: Read error');
      expect(res.end).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('deleteFile', () => {
    test('deletes file successfully and sets success message', async () => {
      req.fileID = '123456789012345678901234';
      mockDelete.mockResolvedValue();

      await exp.deleteFile(req, res);

      expect(mockCreateFromHexString).toHaveBeenCalledWith('123456789012345678901234');
      expect(mockDelete).toHaveBeenCalledWith('ObjectId(123456789012345678901234)');
      expect(req.session.success).toBe('File _id: "123456789012345678901234" deleted! ');
      expect(res.redirect).toHaveBeenCalledWith('/');
    });

    test('handles delete failure and sets error message', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      req.fileID = '123456789012345678901234';
      mockDelete.mockRejectedValue(new Error('Delete error'));

      await exp.deleteFile(req, res);

      expect(req.session.error).toBe('Could not delete the file! Error: Delete error');
      expect(res.redirect).toHaveBeenCalledWith('/');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('unimplemented routes', () => {
    test('addBucket sets error and redirects', () => {
      exp.addBucket(req, res);
      expect(req.session.error).toBe('addBucket not implemented yet');
      expect(res.redirect).toHaveBeenCalledWith('/');
    });

    test('deleteBucket sets error and redirects', () => {
      exp.deleteBucket(req, res);
      expect(req.session.error).toBe('deleteBucket not implemented yet');
      expect(res.redirect).toHaveBeenCalledWith('/');
    });

    test('renameBucket sets error and redirects', () => {
      exp.renameBucket(req, res);
      expect(req.session.error).toBe('renameBucket not implemented yet');
      expect(res.redirect).toHaveBeenCalledWith('/');
    });
  });
});