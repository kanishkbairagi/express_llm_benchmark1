import { jest } from '@jest/globals';
import routes from '../dataset/external/mongo-express__mongo-express/lib/routes/database.js';
import * as utils from '../dataset/external/mongo-express__mongo-express/lib/utils.js';

jest.mock('../dataset/external/mongo-express__mongo-express/lib/utils.js', () => ({
  bytesToSize: jest.fn((v) => `${v}B`),
  isValidDatabaseName: jest.fn(),
}));

const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

const createReqRes = (overrides = {}) => {
  const req = {
    dbConnection: {},
    dbName: 'testdb',
    databases: ['testdb'],
    collections: { testdb: [] },
    gridFSBuckets: { testdb: [] },
    csrfToken: jest.fn(() => 'csrf-token'),
    session: {},
    get: jest.fn(() => '/referrer'),
    updateCollections: jest.fn(),
    updateDatabases: jest.fn(),
    db: {
      stats: jest.fn(),
      dropDatabase: jest.fn(),
    },
    mainClient: {
      client: {
        db: jest.fn(),
      },
    },
    ...overrides,
  };
  const res = {
    render: jest.fn(),
    redirect: jest.fn(),
  };
  return { req, res };
};

afterAll(() => {
  mockConsoleError.mockRestore();
});

describe('database routes', () => {
  const config = {
    site: { baseUrl: '/' },
    mongodb: { admin: true },
  };
  const router = routes(config);

  describe('viewDatabase', () => {
    test('renders with stats when admin and stats succeed', async () => {
      const statsData = {
        avgObjSize: 1024,
        collections: 5,
        dataFileVersion: { major: 1, minor: 2 },
        dataSize: 2048,
        extentFreeList: { num: 3 },
        fileSize: 4096,
        indexes: 2,
        indexSize: 512,
        numExtents: 4,
        objects: 100,
        storageSize: 8192,
      };
      const { req, res } = createReqRes({
        updateCollections: jest.fn().mockResolvedValue(),
        db: { stats: jest.fn().mockResolvedValue(statsData) },
      });

      await router.viewDatabase(req, res);

      expect(req.updateCollections).toHaveBeenCalledWith(req.dbConnection);
      expect(req.db.stats).toHaveBeenCalled();
      expect(utils.bytesToSize).toHaveBeenCalledTimes(6);
      expect(res.render).toHaveBeenCalledWith('database', expect.objectContaining({
        title: 'Viewing Database: testdb',
        databases: req.databases,
        colls: req.collections.testdb,
        grids: req.gridFSBuckets.testdb,
        csrfToken: 'csrf-token',
        stats: expect.objectContaining({
          avgObjSize: '1024B',
          collections: 5,
          dataFileVersion: '1.2',
          dataSize: '2048B',
          extentFreeListNum: 3,
          fileSize: '4096B',
          indexes: 2,
          indexSize: '512B',
          numExtents: '4',
          objects: 100,
          storageSize: '8192B',
        }),
      }));
    });

    test('redirects on stats failure', async () => {
      const error = new Error('stats error');
      const { req, res } = createReqRes({
        updateCollections: jest.fn().mockResolvedValue(),
        db: { stats: jest.fn().mockRejectedValue(error) },
      });

      await router.viewDatabase(req, res);

      expect(req.session.error).toContain('Could not get stats');
      expect(res.redirect).toHaveBeenCalledWith('/');
    });

    test('redirects on updateCollections failure', async () => {
      const error = new Error('update error');
      const { req, res } = createReqRes({
        updateCollections: jest.fn().mockRejectedValue(error),
      });

      await router.viewDatabase(req, res);

      expect(req.session.error).toContain('Could not refresh collections');
      expect(res.redirect).toHaveBeenCalledWith('/');
    });
  });

  describe('addDatabase', () => {
    test('redirects with error when name is invalid', async () => {
      utils.isValidDatabaseName.mockReturnValue(false);
      const { req, res } = createReqRes({
        body: { database: 'bad name' },
      });

      await router.addDatabase(req, res);

      expect(req.session.error).toBe('That database name is invalid.');
      expect(res.redirect).toHaveBeenCalledWith('/');
    });

    test('creates collection and redirects on success', async () => {
      utils.isValidDatabaseName.mockReturnValue(true);
      const mockDb = {
        createCollection: jest.fn().mockResolvedValue(),
      };
      const { req, res } = createReqRes({
        body: { database: 'newdb' },
        mainClient: { client: { db: jest.fn(() => mockDb) } },
        updateDatabases: jest.fn().mockResolvedValue(),
      });

      await router.addDatabase(req, res);

      expect(req.mainClient.client.db).toHaveBeenCalledWith('newdb');
      expect(mockDb.createCollection).toHaveBeenCalledWith('delete_me');
      expect(req.updateDatabases).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/');
    });

    test('handles createCollection failure', async () => {
      utils.isValidDatabaseName.mockReturnValue(true);
      const error = new Error('create error');
      const mockDb = {
        createCollection: jest.fn().mockRejectedValue(error),
      };
      const { req, res } = createReqRes({
        body: { database: 'newdb' },
        mainClient: { client: { db: jest.fn(() => mockDb) } },
      });

      await router.addDatabase(req, res);

      expect(req.session.error).toContain('Could not create collection');
      expect(res.redirect).toHaveBeenCalledWith('/');
    });
  });

  describe('deleteDatabase', () => {
    test('drops and redirects on success', async () => {
      const { req, res } = createReqRes({
        db: { dropDatabase: jest.fn().mockResolvedValue() },
        updateDatabases: jest.fn().mockResolvedValue(),
      });

      await router.deleteDatabase(req, res);

      expect(req.db.dropDatabase).toHaveBeenCalled();
      expect(req.updateDatabases).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/');
    });

    test('redirects with error on drop failure', async () => {
      const error = new Error('drop error');
      const { req, res } = createReqRes({
        db: { dropDatabase: jest.fn().mockRejectedValue(error) },
      });

      await router.deleteDatabase(req, res);

      expect(req.session.error).toContain('Failed to delete database');
      expect(res.redirect).toHaveBeenCalledWith('/');
    });
  });
});