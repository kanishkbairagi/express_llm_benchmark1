import routes from '../dataset/external/mongo-express__mongo-express/lib/routes/database.js';
import { jest } from '@jest/globals';

jest.mock('../dataset/external/mongo-express__mongo-express/lib/utils.js', () => ({
  bytesToSize: jest.fn((n) => `${n}B`),
  isValidDatabaseName: jest.fn(),
}));

import * as utils from '../dataset/external/mongo-express__mongo-express/lib/utils.js';

describe('database routes controller', () => {
  const baseConfig = {
    site: { baseUrl: '/' },
    mongodb: { admin: true },
  };

  const makeReqRes = (overrides = {}) => {
    const req = {
      dbConnection: {},
      db: { stats: jest.fn() },
      dbName: 'testDb',
      databases: ['db1'],
      collections: { testDb: ['coll1'] },
      gridFSBuckets: { testDb: [] },
      csrfToken: jest.fn(() => 'token'),
      session: {},
      updateCollections: jest.fn(),
      updateDatabases: jest.fn(),
      get: jest.fn(),
      body: {},
      mainClient: { client: { db: jest.fn() } },
      ...overrides,
    };
    const res = {
      render: jest.fn(),
      redirect: jest.fn(),
    };
    return { req, res };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('viewDatabase', () => {
    test('renders with stats when admin and stats succeed', async () => {
      const statsData = {
        avgObjSize: 123,
        collections: 5,
        dataFileVersion: { major: 4, minor: 2 },
        dataSize: 456,
        extentFreeList: { num: 2 },
        fileSize: 789,
        indexes: 10,
        indexSize: 111,
        numExtents: 3,
        objects: 1000,
        storageSize: 222,
      };
      const { req, res } = makeReqRes({
        updateCollections: jest.fn().mockResolvedValue(),
        db: { stats: jest.fn().mockResolvedValue(statsData) },
        get: jest.fn(() => '/referrer'),
      });
      const controller = routes(baseConfig);
      await controller.viewDatabase(req, res);
      expect(req.updateCollections).toHaveBeenCalledWith(req.dbConnection);
      expect(req.db.stats).toHaveBeenCalled();
      expect(utils.bytesToSize).toHaveBeenCalledTimes(5);
      expect(res.render).toHaveBeenCalledWith('database', expect.objectContaining({
        title: expect.stringContaining('Viewing Database: testDb'),
        stats: expect.objectContaining({
          avgObjSize: '123B',
          collections: 5,
          dataFileVersion: '4.2',
          dataSize: '456B',
          extentFreeListNum: 2,
          fileSize: '789B',
          indexes: 10,
          indexSize: '111B',
          numExtents: '3',
          objects: 1000,
          storageSize: '222B',
        }),
      }));
    });

    test('redirects on stats error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { req, res } = makeReqRes({
        updateCollections: jest.fn().mockResolvedValue(),
        db: { stats: jest.fn().mockRejectedValue(new Error('stats fail')) },
        get: jest.fn(() => null),
      });
      const controller = routes(baseConfig);
      await controller.viewDatabase(req, res);
      expect(req.session.error).toMatch(/Could not get stats/);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/');
      consoleErrorSpy.mockRestore();
    });

    test('handles updateCollections error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { req, res } = makeReqRes({
        updateCollections: jest.fn().mockRejectedValue(new Error('update fail')),
        get: jest.fn(() => '/back'),
      });
      const controller = routes(baseConfig);
      await controller.viewDatabase(req, res);
      expect(req.session.error).toMatch(/Could not refresh collections/);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/back');
      consoleErrorSpy.mockRestore();
    });

    test('renders with stats false when admin disabled', async () => {
      const config = { ...baseConfig, mongodb: { admin: false } };
      const { req, res } = makeReqRes({
        updateCollections: jest.fn().mockResolvedValue(),
        get: jest.fn(),
      });
      const controller = routes(config);
      await controller.viewDatabase(req, res);
      const ctx = res.render.mock.calls[0][1];
      expect(ctx.stats).toBe(false);
    });
  });

  describe('addDatabase', () => {
    test('creates db and redirects on valid name', async () => {
      utils.isValidDatabaseName.mockReturnValue(true);
      const ndbMock = { createCollection: jest.fn().mockResolvedValue() };
      const { req, res } = makeReqRes({
        body: { database: 'newDb' },
        mainClient: { client: { db: jest.fn(() => ndbMock) } },
        updateDatabases: jest.fn().mockResolvedValue(),
        get: jest.fn(),
      });
      const controller = routes(baseConfig);
      await controller.addDatabase(req, res);
      expect(utils.isValidDatabaseName).toHaveBeenCalledWith('newDb');
      expect(ndbMock.createCollection).toHaveBeenCalledWith('delete_me');
      expect(req.updateDatabases).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/');
    });

    test('rejects invalid database name', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      utils.isValidDatabaseName.mockReturnValue(false);
      const { req, res } = makeReqRes({
        body: { database: 'bad/name' },
        get: jest.fn(() => null),
      });
      const controller = routes(baseConfig);
      await controller.addDatabase(req, res);
      expect(req.session.error).toBe('That database name is invalid.');
      expect(consoleErrorSpy).toHaveBeenCalledWith('That database name is invalid.');
      expect(res.redirect).toHaveBeenCalledWith('/');
      consoleErrorSpy.mockRestore();
    });

    test('handles createCollection error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      utils.isValidDatabaseName.mockReturnValue(true);
      const ndbMock = { createCollection: jest.fn().mockRejectedValue(new Error('create fail')) };
      const { req, res } = makeReqRes({
        body: { database: 'newDb' },
        mainClient: { client: { db: jest.fn(() => ndbMock) } },
        get: jest.fn(() => '/prev'),
      });
      const controller = routes(baseConfig);
      await controller.addDatabase(req, res);
      expect(req.session.error).toMatch(/Could not create collection/);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/prev');
      consoleErrorSpy.mockRestore();
    });
  });

  describe('deleteDatabase', () => {
    test('drops db and redirects on success', async () => {
      const { req, res } = makeReqRes({
        db: { dropDatabase: jest.fn().mockResolvedValue() },
        updateDatabases: jest.fn().mockResolvedValue(),
        get: jest.fn(),
      });
      const controller = routes(baseConfig);
      await controller.deleteDatabase(req, res);
      expect(req.db.dropDatabase).toHaveBeenCalled();
      expect(req.updateDatabases).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/');
    });

    test('handles dropDatabase error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { req, res } = makeReqRes({
        db: { dropDatabase: jest.fn().mockRejectedValue(new Error('drop fail')) },
        get: jest.fn(() => '/back'),
      });
      const controller = routes(baseConfig);
      await controller.deleteDatabase(req, res);
      expect(req.session.error).toMatch(/Failed to delete database/);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/back');
      consoleErrorSpy.mockRestore();
    });
  });
});