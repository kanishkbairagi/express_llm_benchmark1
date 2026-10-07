import { jest } from '@jest/globals';
import routes from '../dataset/external/mongo-express__mongo-express/lib/routes/database.js';

describe('database routes', () => {
  let req;
  let res;
  let config;
  let routeHandlers;

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    config = {
      site: {
        baseUrl: '/mongo/',
      },
      mongodb: {
        admin: false,
      },
    };

    req = {
      dbConnection: {},
      dbName: 'testdb',
      db: {
        stats: jest.fn(),
        dropDatabase: jest.fn(),
      },
      mainClient: {
        client: {
          db: jest.fn(),
        },
      },
      databases: ['testdb'],
      collections: {
        testdb: ['coll1', 'coll2'],
      },
      gridFSBuckets: {
        testdb: ['bucket1'],
      },
      csrfToken: jest.fn().mockReturnValue('csrf-token-123'),
      updateCollections: jest.fn().mockResolvedValue(),
      updateDatabases: jest.fn().mockResolvedValue(),
      get: jest.fn().mockImplementation((header) => {
        if (header === 'Referrer') return 'http://localhost/ref';
        return null;
      }),
      session: {},
      body: {},
    };

    res = {
      render: jest.fn(),
      redirect: jest.fn(),
    };

    routeHandlers = routes(config);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('viewDatabase', () => {
    test('renders database view when mongodb.admin is false', async () => {
      await routeHandlers.viewDatabase(req, res);

      expect(req.updateCollections).toHaveBeenCalledWith(req.dbConnection);
      expect(res.render).toHaveBeenCalledWith('database', {
        title: 'Viewing Database: testdb',
        databases: req.databases,
        colls: ['coll1', 'coll2'],
        grids: ['bucket1'],
        csrfToken: 'csrf-token-123',
        stats: false,
      });
    });

    test('renders database view with formatted stats when mongodb.admin is true', async () => {
      config.mongodb.admin = true;
      const dbStats = {
        avgObjSize: 1024,
        collections: 5,
        dataFileVersion: { major: 1, minor: 2 },
        dataSize: 2048,
        extentFreeList: { num: 3 },
        fileSize: 4096,
        indexes: 2,
        indexSize: 512,
        numExtents: 10,
        objects: 100,
        storageSize: 8192,
      };
      req.db.stats.mockResolvedValue(dbStats);

      await routeHandlers.viewDatabase(req, res);

      expect(req.db.stats).toHaveBeenCalled();
      expect(res.render).toHaveBeenCalledWith('database', expect.objectContaining({
        title: 'Viewing Database: testdb',
        csrfToken: 'csrf-token-123',
        stats: expect.objectContaining({
          avgObjSize: '1 KB',
          collections: 5,
          dataFileVersion: '1.2',
          dataSize: '2 KB',
          extentFreeListNum: 3,
          fileSize: '4 KB',
          indexes: 2,
          indexSize: '512 B',
          numExtents: '10',
          objects: 100,
          storageSize: '8 KB',
        }),
      }));
    });

    test('handles default fallback values for missing properties in db stats', async () => {
      config.mongodb.admin = true;
      const dbStats = {
        avgObjSize: 0,
        collections: 1,
        dataSize: 0,
        fileSize: undefined,
        indexes: 0,
        indexSize: 0,
        objects: 0,
        storageSize: 0,
      };
      req.db.stats.mockResolvedValue(dbStats);

      await routeHandlers.viewDatabase(req, res);

      expect(res.render).toHaveBeenCalledWith('database', expect.objectContaining({
        stats: expect.objectContaining({
          dataFileVersion: null,
          extentFreeListNum: null,
          fileSize: null,
          numExtents: null,
        }),
      }));
    });

    test('handles error during req.db.stats() and redirects to Referrer', async () => {
      config.mongodb.admin = true;
      const statsError = new Error('Stats retrieval failed');
      req.db.stats.mockRejectedValue(statsError);

      await routeHandlers.viewDatabase(req, res);

      expect(req.session.error).toContain('Could not get stats.');
      expect(res.redirect).toHaveBeenCalledWith('http://localhost/ref');
    });

    test('handles error during req.updateCollections and redirects', async () => {
      const updateError = new Error('Update collections failed');
      req.updateCollections.mockRejectedValue(updateError);

      await routeHandlers.viewDatabase(req, res);

      expect(req.session.error).toContain('Could not refresh collections.');
      expect(res.redirect).toHaveBeenCalledWith('http://localhost/ref');
    });

    test('redirects to "/" if Referrer header is missing on error', async () => {
      req.get.mockReturnValue(null);
      req.updateCollections.mockRejectedValue(new Error('Update failed'));

      await routeHandlers.viewDatabase(req, res);

      expect(res.redirect).toHaveBeenCalledWith('/');
    });
  });

  describe('addDatabase', () => {
    test('redirects with error if database name is invalid', async () => {
      req.body.database = '';

      await routeHandlers.addDatabase(req, res);

      expect(req.session.error).toBe('That database name is invalid.');
      expect(res.redirect).toHaveBeenCalledWith('http://localhost/ref');
    });

    test('creates database collection and redirects on success', async () => {
      req.body.database = 'newdb';
      const mockNdb = {
        createCollection: jest.fn().mockResolvedValue(),
      };
      req.mainClient.client.db.mockReturnValue(mockNdb);

      await routeHandlers.addDatabase(req, res);

      expect(req.mainClient.client.db).toHaveBeenCalledWith('newdb');
      expect(mockNdb.createCollection).toHaveBeenCalledWith('delete_me');
      expect(req.updateDatabases).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/mongo/');
    });

    test('falls back to "/" as baseHref when site.baseUrl is omitted', async () => {
      const defaultRoutes = routes({ site: {} });
      req.body.database = 'newdb';
      const mockNdb = {
        createCollection: jest.fn().mockResolvedValue(),
      };
      req.mainClient.client.db.mockReturnValue(mockNdb);

      await defaultRoutes.addDatabase(req, res);

      expect(res.redirect).toHaveBeenCalledWith('/');
    });

    test('handles error during createCollection', async () => {
      req.body.database = 'newdb';
      const createError = new Error('Collection creation failed');
      const mockNdb = {
        createCollection: jest.fn().mockRejectedValue(createError),
      };
      req.mainClient.client.db.mockReturnValue(mockNdb);

      await routeHandlers.addDatabase(req, res);

      expect(req.session.error).toContain('Could not create collection. Err:');
      expect(res.redirect).toHaveBeenCalledWith('http://localhost/ref');
    });
  });

  describe('deleteDatabase', () => {
    test('drops database and redirects to baseHref on success', async () => {
      req.db.dropDatabase.mockResolvedValue();

      await routeHandlers.deleteDatabase(req, res);

      expect(req.db.dropDatabase).toHaveBeenCalled();
      expect(req.updateDatabases).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/mongo/');
    });

    test('handles error during dropDatabase', async () => {
      const dropError = new Error('Drop database failed');
      req.db.dropDatabase.mockRejectedValue(dropError);

      await routeHandlers.deleteDatabase(req, res);

      expect(req.session.error).toContain('Failed to delete database. Err:');
      expect(res.redirect).toHaveBeenCalledWith('http://localhost/ref');
    });

    test('redirects to "/" if Referrer is null when dropDatabase fails', async () => {
      req.get.mockReturnValue(null);
      req.db.dropDatabase.mockRejectedValue(new Error('Drop failed'));

      await routeHandlers.deleteDatabase(req, res);

      expect(res.redirect).toHaveBeenCalledWith('/');
    });
  });
});