import routes from '../dataset/external/mongo-express__mongo-express/lib/routes/gridfs.js';
import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

// Mock mongodb default export
jest.mock('mongodb', () => {
  const mockBucketInstance = {
    openUploadStream: jest.fn(),
    find: jest.fn(),
    openDownloadStream: jest.fn(),
    delete: jest.fn(),
  };
  const GridFSBucket = jest.fn(() => mockBucketInstance);
  const ObjectId = {
    createFromHexString: jest.fn((hex) => hex),
  };
  return {
    __esModule: true,
    default: { GridFSBucket, ObjectId },
    GridFSBucket,
    ObjectId,
  };
});

// Mock utils
jest.mock('../utils.js', () => ({
  __esModule: true,
  bytesToSize: jest.fn((v) => v), // identity for easier assertions
}));

// Helper to create a fresh mock response object
function createRes() {
  return {
    render: jest.fn(),
    redirect: jest.fn(),
    set: jest.fn(),
    end: jest.fn(),
    locals: { gridFSBuckets: { myDb: 'bucketObj' } },
  };
}

// Helper to create a fresh mock request object
function createReq(overrides = {}) {
  const base = {
    bucketName: 'myBucket',
    dbName: 'myDb',
    connFiles: [],
    files: undefined,
    session: {},
    get: jest.fn(() => '/referrer'),
    csrfToken: jest.fn(() => 'csrf-token'),
  };
  return { ...base, ...overrides };
}

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

describe('gridfs routes', () => {
  const exp = routes();

  describe('viewBucket', () => {
    test('renders correct context with transformed files and columns', () => {
      const connFiles = [
        {
          _id: '1',
          filename: 'file1.txt',
          length: 1024,
          chunkSize: 255,
          contentType: 'text/plain',
          metadata: { some: 'value' },
        },
        {
          _id: '2',
          filename: 'file2.jpg',
          length: 2048,
          chunkSize: 255,
          metadata: { contentType: 'image/jpeg', other: 'x' },
        },
      ];
      const req = createReq({ connFiles });
      const res = createRes();

      exp.viewBucket(req, res);

      // Verify render called
      expect(res.render).toHaveBeenCalledTimes(1);
      const [viewName, ctx] = res.render.mock.calls[0];
      expect(viewName).toBe('gridfs');

      // Context checks
      expect(ctx.title).toBe('Viewing Bucket: myBucket');
      expect(ctx.buckets).toBe('bucketObj');
      expect(ctx.csrfToken).toBe('csrf-token');

      // Stats calculations (identity bytesToSize)
      expect(ctx.stats.avgChunk).toBe(255); // (255+255)/2
      expect(ctx.stats.totalSize).toBe(3072); // 1024+2048

      // Files transformed
      const transformed = ctx.files;
      expect(transformed[0].length).toBe(1024);
      expect(transformed[0].chunkSize).toBeUndefined();
      expect(transformed[0].contentType).toBe('text/plain');
      expect(transformed[0].metadata).toEqual({ some: 'value' });

      expect(transformed[1].length).toBe(2048);
      expect(transformed[1].chunkSize).toBeUndefined();
      // contentType lifted from metadata
      expect(transformed[1].contentType).toBe('image/jpeg');
      // metadata.contentType removed, other remains
      expect(transformed[1].metadata).toEqual({ other: 'x' });

      // Columns deduped and _id/chunkSize removed
      expect(ctx.columns).toContain('filename');
      expect(ctx.columns).toContain('length');
      expect(ctx.columns).toContain('contentType');
      expect(ctx.columns).toContain('metadata');
      expect(ctx.columns).not.toContain('_id');
      expect(ctx.columns).not.toContain('chunkSize');
    });
  });

  describe('addFile', () => {
    test('handles missing file upload', async () => {
      const req = createReq({ files: undefined });
      const res = createRes();

      await exp.addFile(req, res);

      expect(req.session.error).toBe('No file uploaded!');
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
    });

    test('successful upload sets success message', async () => {
      const mockUploadStream = {
        on: jest.fn().mockImplementation((ev, fn) => {
          if (ev === 'finish') process.nextTick(fn);
          return mockUploadStream;
        }),
      };
      const { GridFSBucket } = (await import('mongodb')).default;
      GridFSBucket.mockImplementation(() => ({
        openUploadStream: jest.fn(() => mockUploadStream),
      }));

      const req = createReq({
        files: {
          filefield: {
            data: Buffer.from('test'),
            name: 'test.txt',
            mimetype: 'text/plain',
          },
        },
      });
      const res = createRes();

      await exp.addFile(req, res);

      expect(req.session.success).toBe('File uploaded!');
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
    });

    test('upload stream error sets error message', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const mockUploadStream = {
        on: jest.fn().mockImplementation((ev, fn) => {
          if (ev === 'error') process.nextTick(() => fn(new Error('boom')));
          return mockUploadStream;
        }),
      };
      const { GridFSBucket } = (await import('mongodb')).default;
      GridFSBucket.mockImplementation(() => ({
        openUploadStream: jest.fn(() => mockUploadStream),
      }));

      const req = createReq({
        files: {
          filefield: {
            data: Buffer.from('test'),
            name: 'test.txt',
            mimetype: 'text/plain',
          },
        },
      });
      const res = createRes();

      await exp.addFile(req, res);

      expect(req.session.error).toMatch(/Could not upload the file! /);
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getFile', () => {
    test('redirects when file not found', async () => {
      const mockBucket = {
        find: jest.fn(() => ({
          limit: jest.fn(() => ({
            toArray: jest.fn().mockResolvedValue([]),
          })),
        })),
      };
      const { GridFSBucket } = (await import('mongodb')).default;
      GridFSBucket.mockImplementation(() => mockBucket);

      const req = createReq({ fileID: 'nonexistent' });
      const res = createRes();

      await exp.getFile(req, res);

      expect(req.session.error).toBe('File not found!');
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
    });

    test('streams file with correct headers', async () => {
      const fileDoc = {
        _id: 'abc123',
        filename: 'my file.txt',
        metadata: { contentType: 'text/plain' },
      };
      const mockStream = {
        on: jest.fn().mockReturnThis(),
        pipe: jest.fn().mockReturnValue(undefined),
      };
      const mockBucket = {
        find: jest.fn(() => ({
          limit: jest.fn(() => ({
            toArray: jest.fn().mockResolvedValue([fileDoc]),
          })),
        })),
        openDownloadStream: jest.fn(() => mockStream),
      };
      const { GridFSBucket } = (await import('mongodb')).default;
      GridFSBucket.mockImplementation(() => mockBucket);

      const req = createReq({ fileID: 'abc123' });
      const res = createRes();

      await exp.getFile(req, res);

      expect(res.set).toHaveBeenCalledWith('Content-Type', 'text/plain');
      expect(res.set).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('my%20file.txt')
      );
      expect(mockStream.pipe).toHaveBeenCalledWith(res);
    });

    test('handles stream error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const fileDoc = { _id: 'xyz', filename: 'bad.txt' };
      const mockStream = new EventEmitter();
      mockStream.pipe = jest.fn().mockReturnValue(undefined);
      const mockBucket = {
        find: jest.fn(() => ({
          limit: jest.fn(() => ({
            toArray: jest.fn().mockResolvedValue([fileDoc]),
          })),
        })),
        openDownloadStream: jest.fn(() => mockStream),
      };
      const { GridFSBucket } = (await import('mongodb')).default;
      GridFSBucket.mockImplementation(() => mockBucket);

      const req = createReq({ fileID: 'xyz' });
      const res = createRes();

      const getFilePromise = exp.getFile(req, res);
      // Emit error after the async function has attached the listener
      process.nextTick(() => mockStream.emit('error', new Error('stream fail')));
      await getFilePromise;

      expect(req.session.error).toMatch(/Error: /);
      expect(res.end).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('deleteFile', () => {
    test('successful deletion sets success message', async () => {
      const mockBucket = {
        delete: jest.fn().mockResolvedValue(undefined),
      };
      const { GridFSBucket } = (await import('mongodb')).default;
      GridFSBucket.mockImplementation(() => mockBucket);

      const req = createReq({ fileID: 'deadbeef' });
      const res = createRes();

      await exp.deleteFile(req, res);

      expect(req.session.success).toBe('File _id: "deadbeef" deleted! ');
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
    });

    test('deletion error sets error message', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const mockBucket = {
        delete: jest.fn().mockRejectedValue(new Error('boom')),
      };
      const { GridFSBucket } = (await import('mongodb')).default;
      GridFSBucket.mockImplementation(() => mockBucket);

      const req = createReq({ fileID: 'badid' });
      const res = createRes();

      await exp.deleteFile(req, res);

      expect(req.session.error).toMatch(/Could not delete the file! /);
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('unimplemented bucket actions', () => {
    test.each([
      ['addBucket'],
      ['deleteBucket'],
      ['renameBucket'],
    ])('%s sets error and redirects', (method) => {
      const req = createReq();
      const res = createRes();

      exp[method](req, res);

      expect(req.session.error).toMatch(/not implemented yet/);
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
    });
  });
});