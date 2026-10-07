import routes from '../dataset/external/mongo-express__mongo-express/lib/routes/database.js';
import * as utils from '../utils.js';
import { jest } from '@jest/globals';

jest.mock('../utils.js', () => ({
  bytesToSize: jest.fn((n) => `${n}B`),
  isValidDatabaseName: jest.fn(),
}));

describe('database routes', () => {
  const baseHref = '/base/';
  const config = {
    site: { baseUrl: baseHref },
    mongodb: { admin: true },
  };

  const mockRes = () => ({
    render: jest.fn(),
    redirect: jest.fn(),
  });

  const mockReq = (overrides = {}) => ({
    dbConnection: {},
    db: { stats: jest.fn() },
    dbName: 'testdb',
    databases: ['db1', 'db2'],
    collections: { testdb: ['col1'] },
    gridFSBuckets: { testdb: [] },
    csrfToken: jest.fn().mockReturnValue('token'),
    session: {},
    get: jest.fn(),
    updateCollections: jest.fn(),
    updateDatabases: jest.fn(),
    mainClient: { client: { db: jest.fn() } },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('viewDatabase', () => {
    test('renders with stats when admin true and stats succeed', async () => {
      const statsData = {
        avgObjSize: 1234,
        collections: 5,
        dataFileVersion: { major: 1, minor: 2 },
        dataSize: 5678,
        extentFreeList: { num: 3 },
        fileSize: 91011,
        indexes: 7,
        indexSize: 1213,
        numExtents: 4,
        objects: 100,
        storageSize: 1415,
      };
      const req = mockReq({
        updateCollections: jest.fn().mockResolvedValue(),
        db: { stats: jest.fn().mockResolvedValue(statsData) },
        get: jest.fn().mockReturnValue('/referrer'),
      });
      const res = mockRes();

      const { viewDatabase } = routes(config);
      await viewDatabase(req, res);

      expect(req.updateCollections).toHaveBeenCalledWith(req.dbConnection);
      expect(req.db.stats).toHaveBeenCalled();

      const expectedStats = {
        avgObjSize: '1234B',
        collections: 5,
        dataFileVersion: '1.2',
        dataSize: '5678B',
        extentFreeListNum: 3,
        fileSize: '91011B',
        indexes: 7,
        indexSize: '1213B',
        numExtents: '4',
        objects: 100,
        storageSize: '1415B',
      };
      expect(res.render).toHaveBeenCalledWith('database', expect.objectContaining({
        title: 'Viewing Database: testdb',
        databases: req.databases,
        colls: req.collections.testdb,
        grids: req.gridFSBuckets.testdb,
        csrfToken: 'token',
        stats: expectedStats,
      }));
    });

    test('redirects on stats error', async () => {
      const req = mockReq({
        updateCollections: jest.fn().mockResolvedValue(),
        db: { stats: jest.fn().mockRejectedValue(new Error('stats fail')) },
        get: jest.fn().mockReturnValue('/referrer'),
      });
      const res = mockRes();

      const { viewDatabase } = routes(config);
      await viewDatabase(req, res);

      expect(req.session.error).toMatch(/Could not get stats/);
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
    });

    test('renders with stats false when admin disabled', async () => {
      const cfg = { ...config, mongodb: { admin: false } };
      const req = mockReq({
        updateCollections: jest.fn().mockResolvedValue(),
        get: jest.fn(),
      });
      const res = mockRes();

      const { viewDatabase } = routes(cfg);
      await viewDatabase(req, res);

      expect(res.render).toHaveBeenCalledWith('database', expect.objectContaining({ stats: false }));
    });

    test('redirects on updateCollections error', async () => {
      const req = mockReq({
        updateCollections: jest.fn().mockRejectedValue(new Error('update fail')),
        get: jest.fn().mockReturnValue('/back'),
      });
      const res = mockRes();

      const { viewDatabase } = routes(config);
      await viewDatabase(req, res);

      expect(req.session.error).toMatch(/Could not refresh collections/);
      expect(res.redirect).toHaveBeenCalledWith('/back');
    });
  });

  describe('addDatabase', () => {
    const validName = 'newdb';

    test('redirects with error when name invalid', async () => {
      utils.isValidDatabaseName.mockReturnValue(false);
      const req = mockReq({
        body: { database: 'bad name' },
        get: jest.fn().mockReturnValue('/referrer'),
      });
      const res = mockRes();

      const { addDatabase } = routes(config);
      await addDatabase(req, res);

      expect(req.session.error).toBe('That database name is invalid.');
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
    });

    test('creates collection and redirects on success', async () => {
      utils.isValidDatabaseName.mockReturnValue(true);
      const createCollectionMock = jest.fn().mockResolvedValue();
      const updateDatabasesMock = jest.fn().mockResolvedValue();
      const req = mockReq({
        body: { database: validName },
        mainClient: { client: { db: jest.fn().mockReturnValue({ createCollection: createCollectionMock }) } },
        updateDatabases: updateDatabasesMock,
        get: jest.fn(),
      });
      const res = mockRes();

      const { addDatabase } = routes(config);
      await addDatabase(req, res);

      expect(req.mainClient.client.db).toHaveBeenCalledWith(validName);
      expect(createCollectionMock).toHaveBeenCalledWith('delete_me');
      expect(updateDatabasesMock).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(baseHref);
    });

    test('sets error and redirects on createCollection failure', async () => {
      utils.isValidDatabaseName.mockReturnValue(true);
      const createCollectionMock = jest.fn().mockRejectedValue(new Error('create fail'));
      const req = mockReq({
        body: { database: validName },
        mainClient: { client: { db: jest.fn().mockReturnValue({ createCollection: createCollectionMock }) } },
        get: jest.fn().mockReturnValue('/ref'),
      });
      const res = mockRes();

      const { addDatabase } = routes(config);
      await addDatabase(req, res);

      expect(req.session.error).toMatch(/Could not create collection/);
      expect(res.redirect).toHaveBeenCalledWith('/ref');
    });
  });

  describe('deleteDatabase', () => {
    test('drops database and redirects on success', async () => {
      const dropDatabaseMock = jest.fn().mockResolvedValue();
      const updateDatabasesMock = jest.fn().mockResolvedValue();
      const req = mockReq({
        db: { dropDatabase: dropDatabaseMock },
        updateDatabases: updateDatabasesMock,
        get: jest.fn(),
      });
      const res = mockRes();

      const { deleteDatabase } = routes(config);
      await deleteDatabase(req, res);

      expect(dropDatabaseMock).toHaveBeenCalled();
      expect(updateDatabasesMock).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(baseHref);
    });

    test('sets error and redirects on drop failure', async () => {
      const dropDatabaseMock = jest.fn().mockRejectedValue(new Error('drop fail'));
      const req = mockReq({
        db: { dropDatabase: dropDatabaseMock },
        get: jest.fn().mockReturnValue('/back'),
      });
      const res = mockRes();

      const { deleteDatabase } = routes(config);
      await deleteDatabase(req, res);

      expect(req.session.error).toMatch(/Failed to delete database/);
      expect(res.redirect).toHaveBeenCalledWith('/back');
    });
  });
});