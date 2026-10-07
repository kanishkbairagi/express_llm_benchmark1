import { jest } from '@jest/globals';
import routes from '../dataset/external/mongo-express__mongo-express/lib/routes/document.js';
import * as bson from '../dataset/external/mongo-express__mongo-express/lib/routes/bson.js';
import * as filters from '../dataset/external/mongo-express__mongo-express/lib/routes/filters.js';
import * as utils from '../dataset/external/mongo-express__mongo-express/lib/routes/utils.js';

jest.mock('../dataset/external/mongo-express__mongo-express/lib/routes/bson.js');
jest.mock('../dataset/external/mongo-express__mongo-express/lib/routes/filters.js');
jest.mock('../dataset/external/mongo-express__mongo-express/lib/routes/utils.js');

describe('document routes', () => {
  const mockConfig = { options: { readOnly: false, persistEditMode: false } };
  const handlers = routes(mockConfig);

  const mockRes = () => ({
    send: jest.fn(),
    render: jest.fn(),
    redirect: jest.fn(),
    locals: { baseHref: '/base' },
  });

  const mockReq = (overrides = {}) => ({
    query: {},
    body: {},
    session: {},
    get: jest.fn(),
    csrfToken: jest.fn().mockReturnValue('csrf-token'),
    collection: {
      insertOne: jest.fn(),
      replaceOne: jest.fn(),
      deleteOne: jest.fn(),
    },
    document: { _id: 'docId' },
    prop: 'someProp',
    dbName: 'db',
    collectionName: 'col',
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    utils.buildCollectionURL.mockImplementation((baseHref, db, coll, params = {}) =>
      `${baseHref}/${db}/${coll}?${new URLSearchParams(params).toString()}`
    );
    utils.buildDocumentURL.mockImplementation(
      (baseHref, db, coll, id, params = {}) =>
        `${baseHref}/${db}/${coll}/${id}?${new URLSearchParams(params).toString()}`
    );
  });

  describe('getProperty', () => {
    it('sends the property from request', () => {
      const req = mockReq({ prop: 'value' });
      const res = mockRes();

      handlers.getProperty(req, res);
      expect(res.send).toHaveBeenCalledWith('value');
    });
  });

  describe('viewDocument', () => {
    it('renders document view with correct context', () => {
      const docString = 'line1\nline2\r\nline3';
      bson.toString.mockReturnValue(docString);
      const req = mockReq({
        document: { _id: '123' },
        query: { skip: 5 },
      });
      const res = mockRes();

      handlers.viewDocument(req, res);

      expect(res.render).toHaveBeenCalledWith('document', expect.objectContaining({
        title: expect.stringContaining('Editing Document'),
        docLength: 3,
        docString: docString,
        skip: 5,
        csrfToken: 'csrf-token',
      }));
    });

    it('uses readOnly title when config.options.readOnly true', () => {
      const readOnlyHandlers = routes({ options: { readOnly: true } });
      const req = mockReq({ document: { _id: 'abc' } });
      const res = mockRes();

      bson.toString.mockReturnValue('doc');
      readOnlyHandlers.viewDocument(req, res);

      expect(res.render).toHaveBeenCalledWith('document', expect.objectContaining({
        title: expect.stringContaining('Viewing Document'),
      }));
    });
  });

  describe('checkValid', () => {
    it('sends Valid when BSON conversion succeeds', () => {
      const req = mockReq({ body: { document: { a: 1 } } });
      const res = mockRes();

      bson.toBSON.mockReturnValue({ a: 1 });
      handlers.checkValid(req, res);
      expect(res.send).toHaveBeenCalledWith('Valid');
    });

    it('sends Invalid when BSON conversion throws', () => {
      const req = mockReq({ body: { document: { a: 1 } } });
      const res = mockRes();

      bson.toBSON.mockImplementation(() => {
        throw new Error('bad');
      });
      console.error = jest.fn();

      handlers.checkValid(req, res);
      expect(console.error).toHaveBeenCalled();
      expect(res.send).toHaveBeenCalledWith('Invalid');
    });
  });

  describe('addDocument', () => {
    it('redirects with error when document is missing', async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();
      req.get.mockReturnValue('/ref');

      await handlers.addDocument(req, res);
      expect(req.session.error).toBe('You forgot to enter a document!');
      expect(res.redirect).toHaveBeenCalledWith('/ref');
    });

    it('redirects with error when BSON conversion fails', async () => {
      const req = mockReq({ body: { document: 'bad' } });
      const res = mockRes();
      req.get.mockReturnValue('/ref');
      bson.toBSON.mockImplementation(() => { throw new Error('invalid'); });
      console.error = jest.fn();

      await handlers.addDocument(req, res);
      expect(req.session.error).toBe('That document is not valid!');
      expect(console.error).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/ref');
    });

    it('inserts document and redirects on success', async () => {
      const req = mockReq({
        body: { document: '{ "a": 1 }' },
        collection: { insertOne: jest.fn().mockResolvedValue({}) },
      });
      const res = mockRes();

      bson.toBSON.mockReturnValue({ a: 1 });
      await handlers.addDocument(req, res);

      expect(req.collection.insertOne).toHaveBeenCalledWith({ a: 1 });
      expect(req.session.success).toBe('Document added!');
      expect(res.redirect).toHaveBeenCalledWith(
        utils.buildCollectionURL(res.locals.baseHref, req.dbName, req.collectionName)
      );
    });

    it('handles insertion error', async () => {
      const req = mockReq({
        body: { document: '{ "a": 1 }' },
        collection: { insertOne: jest.fn().mockRejectedValue(new Error('boom')) },
      });
      const res = mockRes();
      req.get.mockReturnValue('/ref');
      bson.toBSON.mockReturnValue({ a: 1 });
      console.error = jest.fn();

      await handlers.addDocument(req, res);
      expect(req.session.error).toMatch(/Something went wrong/);
      expect(console.error).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/ref');
    });
  });

  describe('updateDocument', () => {
    const baseReq = {
      body: { document: '{ "b": 2 }' },
      document: { _id: 'docId' },
      collection: { replaceOne: jest.fn().mockResolvedValue({}) },
      query: { skip: 3, key: 'k' },
      get: jest.fn().mockReturnValue('/ref'),
    };

    it('errors when document missing', async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();

      await handlers.updateDocument(req, res);
      expect(req.session.error).toBe('You forgot to enter a document!');
      expect(res.redirect).toHaveBeenCalledWith('/ref');
    });

    it('errors when BSON conversion fails', async () => {
      const req = mockReq({
        body: { document: 'bad' },
        document: { _id: 'docId' },
      });
      const res = mockRes();
      bson.toBSON.mockImplementation(() => { throw new Error('bad'); });
      console.error = jest.fn();

      await handlers.updateDocument(req, res);
      expect(req.session.error).toBe('That document is not valid!');
      expect(console.error).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/ref');
    });

    it('updates and redirects to collection when persistEditMode false', async () => {
      const req = mockReq({ ...baseReq, query: {} });
      const res = mockRes();
      bson.toBSON.mockReturnValue({ b: 2 });

      await handlers.updateDocument(req, res);
      expect(req.collection.replaceOne).toHaveBeenCalledWith(req.document, { b: 2, _id: 'docId' });
      expect(req.session.success).toBe('Document updated!');
      expect(res.redirect).toHaveBeenCalledWith(
        utils.buildCollectionURL(res.locals.baseHref, req.dbName, req.collectionName, {})
      );
    });

    it('updates and redirects to document when persistEditMode true', async () => {
      const config = { options: { persistEditMode: true } };
      const editHandlers = routes(config);
      const req = mockReq({ ...baseReq, query: { foo: 'bar' } });
      const res = mockRes();
      bson.toBSON.mockReturnValue({ b: 2 });

      await editHandlers.updateDocument(req, res);
      expect(req.session.success).toBe('Document updated!');
      expect(res.redirect).toHaveBeenCalledWith(
        utils.buildDocumentURL(res.locals.baseHref, req.dbName, req.collectionName, req.document._id, {
          skip: 3,
          key: 'k',
          value: '',
          type: '',
          query: '',
          projection: '',
          sort: {},
        })
      );
    });

    it('handles replace error', async () => {
      const req = mockReq({ ...baseReq });
      const res = mockRes();
      bson.toBSON.mockReturnValue({ b: 2 });
      req.collection.replaceOne.mockRejectedValue(new Error('fail'));
      console.error = jest.fn();

      await handlers.updateDocument(req, res);
      expect(req.session.error).toMatch(/Something went wrong/);
      expect(console.error).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/ref');
    });
  });

  describe('deleteDocument', () => {
    it('deletes and redirects to collection on success', async () => {
      const req = mockReq({
        collection: { deleteOne: jest.fn().mockResolvedValue({}) },
        document: { _id: 'docId' },
        query: { page: 2 },
      });
      const res = mockRes();

      await handlers.deleteDocument(req, res);
      expect(req.collection.deleteOne).toHaveBeenCalledWith(req.document);
      expect(req.session.success).toMatch(/Document deleted/);
      expect(res.redirect).toHaveBeenCalledWith(
        utils.buildCollectionURL(res.locals.baseHref, req.dbName, req.collectionName, {
          skip: 0,
          key: '',
          value: '',
          type: '',
          query: '',
          projection: '',
          sort: {},
        })
      );
    });

    it('handles deletion error', async () => {
      const req = mockReq({
        collection: { deleteOne: jest.fn().mockRejectedValue(new Error('boom')) },
      });
      const res = mockRes();
      req.get.mockReturnValue('/ref');
      console.error = jest.fn();

      await handlers.deleteDocument(req, res);
      expect(req.session.error).toMatch(/Something went wrong/);
      expect(console.error).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/ref');
    });
  });
});