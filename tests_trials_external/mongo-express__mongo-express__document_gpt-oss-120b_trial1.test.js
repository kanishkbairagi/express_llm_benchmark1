import { jest } from '@jest/globals';
import routes from '../dataset/external/mongo-express__mongo-express/lib/routes/document.js';
import * as bson from '../dataset/external/mongo-express__mongo-express/lib/bson.js';
import * as filters from '../dataset/external/mongo-express__mongo-express/lib/filters.js';
import { buildCollectionURL, buildDocumentURL } from '../dataset/external/mongo-express__mongo-express/lib/utils.js';

jest.mock('../dataset/external/mongo-express__mongo-express/lib/bson.js');
jest.mock('../dataset/external/mongo-express__mongo-express/lib/filters.js');
jest.mock('../dataset/external/mongo-express__mongo-express/lib/utils.js');

describe('document routes', () => {
  const baseHref = '/base';
  const dbName = 'testdb';
  const collectionName = 'testcol';
  const docId = { $oid: '12345' };
  const document = { _id: docId, a: 1 };
  const viewParams = {
    skip: 0,
    key: '',
    value: '',
    type: '',
    query: '',
    projection: '',
    sort: {},
  };

  const makeReqRes = (overrides = {}) => {
    const req = {
      query: {},
      body: {},
      collection: {
        insertOne: jest.fn(),
        replaceOne: jest.fn(),
        deleteOne: jest.fn(),
      },
      document,
      dbName,
      collectionName,
      session: {},
      get: jest.fn(),
      csrfToken: jest.fn(),
      ...overrides,
    };
    const res = {
      send: jest.fn(),
      render: jest.fn(),
      redirect: jest.fn(),
      locals: { baseHref },
      ...overrides.res,
    };
    return { req, res };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations
    bson.toString.mockImplementation((doc) => JSON.stringify(doc, null, 2));
    bson.toBSON.mockImplementation((doc) => (typeof doc === 'string' ? JSON.parse(doc) : doc));
    filters.stringDocIDs.mockReturnValue('string-id');
    buildCollectionURL.mockImplementation((base, db, coll, params = {}) => `${base}/${db}/${coll}?${new URLSearchParams(params).toString()}`);
    buildDocumentURL.mockImplementation((base, db, coll, id, params = {}) => `${base}/${db}/${coll}/${id}?${new URLSearchParams(params).toString()}`);
  });

  test('viewDocument renders with correct context', () => {
    const config = { options: { readOnly: false } };
    const { req, res } = makeReqRes({
      query: { skip: 5 },
      csrfToken: () => 'csrf-token',
    });

    const controller = routes(config);
    controller.viewDocument(req, res);

    expect(res.render).toHaveBeenCalledWith('document', expect.objectContaining({
      title: 'Editing Document: string-id',
      docLength: expect.any(Number),
      docString: expect.any(String),
      skip: 5,
      csrfToken: 'csrf-token',
    }));
    // Verify docString comes from bson.toString
    const expectedString = JSON.stringify(document, null, 2);
    expect(res.render.mock.calls[0][1].docString).toBe(expectedString);
    // docLength should be count of lines in expectedString
    const lineCount = expectedString.split(/\r\n|\r|\n/).length;
    expect(res.render.mock.calls[0][1].docLength).toBe(lineCount);
  });

  test('checkValid sends Valid when BSON conversion succeeds', () => {
    const config = { options: {} };
    const { req, res } = makeReqRes({
      body: { document: { a: 1 } },
    });
    const controller = routes(config);
    controller.checkValid(req, res);
    expect(res.send).toHaveBeenCalledWith('Valid');
  });

  test('checkValid sends Invalid when BSON conversion throws', () => {
    const config = { options: {} };
    const error = new Error('bad bson');
    bson.toBSON.mockImplementation(() => { throw error; });
    const { req, res } = makeReqRes({
      body: { document: { a: 1 } },
    });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const controller = routes(config);
    controller.checkValid(req, res);
    expect(res.send).toHaveBeenCalledWith('Invalid');
    expect(consoleErrorSpy).toHaveBeenCalledWith(error);
    consoleErrorSpy.mockRestore();
  });

  describe('addDocument', () => {
    const config = { options: {} };

    test('redirects with error when document is missing', async () => {
      const { req, res } = makeReqRes({
        get: jest.fn().mockReturnValue('/referrer'),
        body: {},
      });
      const controller = routes(config);
      await controller.addDocument(req, res);
      expect(req.session.error).toBe('You forgot to enter a document!');
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
    });

    test('redirects with error when document is invalid BSON', async () => {
      const error = new Error('invalid');
      bson.toBSON.mockImplementation(() => { throw error; });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { req, res } = makeReqRes({
        get: jest.fn().mockReturnValue('/referrer'),
        body: { document: 'not-json' },
      });
      const controller = routes(config);
      await controller.addDocument(req, res);
      expect(req.session.error).toBe('That document is not valid!');
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
      expect(consoleErrorSpy).toHaveBeenCalledWith(error);
      consoleErrorSpy.mockRestore();
    });

    test('successful insert sets success and redirects to collection URL', async () => {
      const insertMock = jest.fn().mockResolvedValue({});
      const { req, res } = makeReqRes({
        body: { document: '{"a":2}' },
        collection: { insertOne: insertMock },
        get: jest.fn(),
      });
      const controller = routes(config);
      await controller.addDocument(req, res);
      expect(req.session.success).toBe('Document added!');
      expect(insertMock).toHaveBeenCalledWith({ a: 2 });
      expect(res.redirect).toHaveBeenCalledWith(buildCollectionURL(baseHref, dbName, collectionName));
    });

    test('failed insert sets error and redirects to referrer', async () => {
      const insertMock = jest.fn().mockRejectedValue(new Error('boom'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { req, res } = makeReqRes({
        body: { document: '{"a":3}' },
        collection: { insertOne: insertMock },
        get: jest.fn().mockReturnValue('/referrer'),
      });
      const controller = routes(config);
      await controller.addDocument(req, res);
      expect(req.session.error).toContain('Something went wrong:');
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('updateDocument', () => {
    const baseConfig = { options: { persistEditMode: false } };
    const persistConfig = { options: { persistEditMode: true } };

    test('missing document leads to error redirect', async () => {
      const { req, res } = makeReqRes({
        get: jest.fn().mockReturnValue('/referrer'),
        body: {},
      });
      const controller = routes(baseConfig);
      await controller.updateDocument(req, res);
      expect(req.session.error).toBe('You forgot to enter a document!');
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
    });

    test('invalid BSON leads to error redirect', async () => {
      const error = new Error('bad');
      bson.toBSON.mockImplementation(() => { throw error; });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { req, res } = makeReqRes({
        get: jest.fn().mockReturnValue('/referrer'),
        body: { document: 'bad' },
      });
      const controller = routes(baseConfig);
      await controller.updateDocument(req, res);
      expect(req.session.error).toBe('That document is not valid!');
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
      expect(consoleErrorSpy).toHaveBeenCalledWith(error);
      consoleErrorSpy.mockRestore();
    });

    test('successful replace redirects to collection when persistEditMode false', async () => {
      const replaceMock = jest.fn().mockResolvedValue({});
      const { req, res } = makeReqRes({
        body: { document: '{"a":10}' },
        collection: { replaceOne: replaceMock },
        get: jest.fn(),
        query: { skip: 2, key: 'k' },
      });
      const controller = routes(baseConfig);
      await controller.updateDocument(req, res);
      expect(req.session.success).toBe('Document updated!');
      expect(replaceMock).toHaveBeenCalledWith(document, { a: 10, _id: docId });
      expect(res.redirect).toHaveBeenCalledWith(buildCollectionURL(baseHref, dbName, collectionName, viewParams));
    });

    test('successful replace redirects to document when persistEditMode true', async () => {
      const replaceMock = jest.fn().mockResolvedValue({});
      const { req, res } = makeReqRes({
        body: { document: '{"a":11}' },
        collection: { replaceOne: replaceMock },
        get: jest.fn(),
        query: { key: 'k' },
      });
      const controller = routes(persistConfig);
      await controller.updateDocument(req, res);
      expect(req.session.success).toBe('Document updated!');
      expect(res.redirect).toHaveBeenCalledWith(buildDocumentURL(baseHref, dbName, collectionName, docId, viewParams));
    });

    test('replace failure sets error and redirects to referrer', async () => {
      const replaceMock = jest.fn().mockRejectedValue(new Error('oops'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { req, res } = makeReqRes({
        body: { document: '{"a":12}' },
        collection: { replaceOne: replaceMock },
        get: jest.fn().mockReturnValue('/referrer'),
        query: {},
      });
      const controller = routes(baseConfig);
      await controller.updateDocument(req, res);
      expect(req.session.error).toContain('Something went wrong:');
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('deleteDocument', () => {
    const config = { options: {} };

    test('successful delete sets success and redirects to collection with viewParams', async () => {
      const deleteMock = jest.fn().mockResolvedValue({});
      const { req, res } = makeReqRes({
        collection: { deleteOne: deleteMock },
        query: { key: 'k', skip: 1 },
      });
      const controller = routes(config);
      await controller.deleteDocument(req, res);
      expect(req.session.success).toBe('Document deleted! _id: string-id');
      expect(deleteMock).toHaveBeenCalledWith(document);
      expect(res.redirect).toHaveBeenCalledWith(buildCollectionURL(baseHref, dbName, collectionName, viewParams));
    });

    test('delete failure sets error and redirects to referrer', async () => {
      const deleteMock = jest.fn().mockRejectedValue(new Error('fail'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { req, res } = makeReqRes({
        collection: { deleteOne: deleteMock },
        get: jest.fn().mockReturnValue('/referrer'),
        query: {},
      });
      const controller = routes(config);
      await controller.deleteDocument(req, res);
      expect(req.session.error).toContain('Something went wrong!');
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  test('getProperty sends the prop from request', () => {
    const config = { options: {} };
    const { req, res } = makeReqRes({
      prop: 'someProp',
    });
    const controller = routes(config);
    controller.getProperty(req, res);
    expect(res.send).toHaveBeenCalledWith('someProp');
  });
});