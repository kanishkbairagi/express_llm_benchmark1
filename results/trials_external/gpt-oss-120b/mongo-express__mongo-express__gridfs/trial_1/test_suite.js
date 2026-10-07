import { jest } from '@jest/globals';
import routesFactory from '../dataset/external/mongo-express__mongo-express/lib/routes/gridfs.js';
import mongo from 'mongodb';
import * as utils from '../dataset/external/mongo-express__mongo-express/lib/routes/../utils.js';
import { EventEmitter } from 'node:events';

// ---------- Mocks ----------
jest.mock('mongodb', () => {
  const EventEmitter = require('node:events');
  class MockBucket {
    constructor() {}
    openUploadStream() {
      const stream = new EventEmitter();
      // mimic a writable stream with pipe returning the same stream
      stream.pipe = () => stream;
      // finish will be emitted manually in tests
      return stream;
    }
    openDownloadStream() {
      const stream = new EventEmitter();
      stream.pipe = (dest) => {
        // simulate immediate pipe
        dest.emit('end');
        return dest;
      };
      return stream;
    }
    find() {
      return {
        limit: () => ({
          toArray: async () => [],
        }),
      };
    }
    delete: jest.fn(),
  }
  return {
    GridFSBucket: MockBucket,
    ObjectId: {
      createFromHexString: jest.fn((hex) => hex),
    },
  };
});

jest.mock('../dataset/external/mongo-express__mongo-express/lib/routes/../utils.js', () => ({
  bytesToSize: jest.fn((bytes) => `${bytes}B`),
}));

// ---------- Helpers ----------
function mockResponse() {
  const res = {
    locals: { gridFSBuckets: { testdb: ['bucket1', 'bucket2'] } },
    render: jest.fn(),
    redirect: jest.fn(),
    set: jest.fn(),
    end: jest.fn(),
  };
  return res;
}

function mockRequest(overrides = {}) {
  const base = {
    bucketName: 'testbucket',
    dbName: 'testdb',
    connFiles: [],
    csrfToken: jest.fn(() => 'token123'),
    get: jest.fn(() => '/referrer'),
    session: {},
    files: undefined,
    db: {}, // mock db object, not used directly
  };
  return { ...base, ...overrides };
}

// ---------- Tests ----------
describe('gridfs routes', () => {
  let routes;
  beforeEach(() => {
    jest.clearAllMocks();
    routes = routesFactory();
  });

  describe('viewBucket', () => {
    test('generates correct columns and formats file sizes', () => {
      const req = mockRequest({
        bucketName: 'mybucket',
        dbName: 'mydb',
        connFiles: [
          {
            filename: 'a.txt',
            length: 2048,
            chunkSize: 255,
            metadata: { contentType: 'text/plain', extra: 'val' },
          },
          {
            filename: 'b.jpg',
            length: 4096,
            chunkSize: 255,
            contentType: 'image/jpeg',
          },
        ],
      });
      const res = mockResponse();

      routes.viewBucket(req, res);

      // columns should contain filename, length, contentType, extra (metadata keys)
      expect(res.render).toHaveBeenCalledTimes(1);
      const [view, ctx] = res.render.mock.calls[0];
      expect(view).toBe('gridfs');
      // ensure default columns appear first
      expect(ctx.columns.slice(0, 2)).toEqual(['filename', 'length']);
      // ensure duplicate removal
      expect(ctx.columns).toContain('contentType');
      expect(ctx.columns).toContain('extra');
      expect(ctx.columns).not.toContain('_id');
      expect(ctx.columns).not.toContain('chunkSize');

      // file length formatted
      expect(ctx.files[0].length).toBe('2048B');
      expect(ctx.files[1].length).toBe('4096B');

      // contentType should be lifted to top level
      expect(ctx.files[0].contentType).toBe('text/plain');
      expect(ctx.files[0].metadata).toEqual({ extra: 'val' });
      expect(ctx.files[1].contentType).toBe('image/jpeg');

      // stats calculations use utils.bytesToSize
      expect(utils.bytesToSize).toHaveBeenCalled();
      expect(ctx.stats.avgChunk).toMatch(/B$/);
      expect(ctx.stats.totalSize).toMatch(/B$/);
    });
  });

  describe('addFile', () => {
    test('successful upload sets success session and redirects', async () => {
      const mockFinish = new EventEmitter();
      const bucketInstance = new mongo.GridFSBucket();
      jest.spyOn(bucketInstance, 'openUploadStream').mockReturnValue(mockFinish);
      jest.spyOn(mongo, 'GridFSBucket').mockReturnValue(bucketInstance);

      const req = mockRequest({
        files: {
          filefield: { data: Buffer.from('hello'), name: 'hello.txt', mimetype: 'text/plain' },
        },
      });
      const res = mockResponse();

      // trigger async flow
      const promise = routes.addFile(req, res);
      // simulate finish event
      mockFinish.emit('finish');
      await promise;

      expect(req.session.success).toBe('File uploaded!');
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
    });

    test('missing file sets error and redirects', async () => {
      const req = mockRequest({ files: {} });
      const res = mockResponse();

      await routes.addFile(req, res);
      expect(req.session.error).toBe('No file uploaded!');
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
    });

    test('upload error sets error session', async () => {
      const mockError = new EventEmitter();
      const bucketInstance = new mongo.GridFSBucket();
      jest.spyOn(bucketInstance, 'openUploadStream').mockReturnValue(mockError);
      jest.spyOn(mongo, 'GridFSBucket').mockReturnValue(bucketInstance);

      const req = mockRequest({
        files: {
          filefield: { data: Buffer.from('bad'), name: 'bad.bin', mimetype: 'application/octet-stream' },
        },
      });
      const res = mockResponse();

      const promise = routes.addFile(req, res);
      mockError.emit('error', new Error('boom'));
      await promise;

      expect(req.session.error).toMatch(/Could not upload the file!/);
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
    });
  });

  describe('getFile', () => {
    const fileDoc = {
      _id: '123',
      filename: 'doc.pdf',
      length: 1024,
      metadata: { contentType: 'application/pdf' },
    };

    test('streams file when found', async () => {
      const bucketInstance = new mongo.GridFSBucket();
      const findMock = jest.fn(() => ({
        limit: () => ({
          toArray: async () => [fileDoc],
        }),
      }));
      bucketInstance.find = findMock;
      const downloadStream = new EventEmitter();
      downloadStream.pipe = jest.fn(() => downloadStream);
      bucketInstance.openDownloadStream = jest.fn(() => downloadStream);
      jest.spyOn(mongo, 'GridFSBucket').mockReturnValue(bucketInstance);

      const req = mockRequest({ fileID: 'abc' });
      const res = mockResponse();
      res.set = jest.fn();
      res.end = jest.fn();

      const handlerPromise = routes.getFile(req, res);
      // simulate download finish
      downloadStream.emit('end');
      await handlerPromise;

      expect(res.set).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.set).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('doc.pdf')
      );
      expect(bucketInstance.openDownloadStream).toHaveBeenCalledWith('abc');
    });

    test('redirects with error when file not found', async () => {
      const bucketInstance = new mongo.GridFSBucket();
      bucketInstance.find = () => ({
        limit: () => ({
          toArray: async () => [],
        }),
      });
      jest.spyOn(mongo, 'GridFSBucket').mockReturnValue(bucketInstance);

      const req = mockRequest({ fileID: 'missing' });
      const res = mockResponse();

      await routes.getFile(req, res);
      expect(req.session.error).toBe('File not found!');
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
    });
  });

  describe('deleteFile', () => {
    test('successful delete sets success session', async () => {
      const bucketInstance = new mongo.GridFSBucket();
      bucketInstance.delete = jest.fn().mockResolvedValue(undefined);
      jest.spyOn(mongo, 'GridFSBucket').mockReturnValue(bucketInstance);
      const req = mockRequest({ fileID: 'deadbeef' });
      const res = mockResponse();

      await routes.deleteFile(req, res);
      expect(req.session.success).toContain('deleted');
      expect(bucketInstance.delete).toHaveBeenCalledWith('deadbeef');
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
    });

    test('delete error sets error session', async () => {
      const bucketInstance = new mongo.GridFSBucket();
      bucketInstance.delete = jest.fn().mockRejectedValue(new Error('boom'));
      jest.spyOn(mongo, 'GridFSBucket').mockReturnValue(bucketInstance);
      const req = mockRequest({ fileID: 'badid' });
      const res = mockResponse();

      await routes.deleteFile(req, res);
      expect(req.session.error).toMatch(/Could not delete the file/);
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
    });
  });
});