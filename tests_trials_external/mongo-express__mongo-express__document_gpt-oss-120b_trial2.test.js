import { jest } from '@jest/globals';
import routes from '../dataset/external/mongo-express__mongo-express/lib/routes/document.js';
import * as bson from '../dataset/external/mongo-express__mongo-express/lib/routes/../bson.js';
import * as filters from '../dataset/external/mongo-express__mongo-express/lib/routes/../filters.js';
import { buildCollectionURL, buildDocumentURL } from '../dataset/external/mongo-express__mongo-express/lib/routes/../utils.js';

jest.mock('../dataset/external/mongo-express__mongo-express/lib/routes/../bson.js');
jest.mock('../dataset/external/mongo-express__mongo-express/lib/routes/../filters.js');
jest.mock('../dataset/external/mongo-express__mongo-express/lib/routes/../utils.js');

describe('document routes controller', () => {
  const config = { options: { readOnly: false, persistEditMode: false } };
  const controller = routes(config);

  const makeRes = () => ({
    send: jest.fn(),
    render: jest.fn(),
    redirect: jest.fn(),
    locals: { baseHref: '/base' },
  });

  const makeReq = (overrides = {}) => ({
    prop: 'someProp',
    document: { _id: '12345', toString: () => '' },
    query: {},
    csrfToken: jest.fn().mockReturnValue('csrf-token'),
    session: {},
    collection: {
      insertOne: jest.fn(),
      replaceOne: jest.fn(),
      deleteOne: jest.fn(),
    },
    get: jest.fn().mockReturnValue('/referrer'),
    body: {},
    dbName: 'db',
    collectionName: 'col',
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getProperty sends the requested property', () => {
    const req = makeReq({ prop: 'value' });
    const res = makeRes();

    controller.getProperty(req, res);
    expect(res.send).toHaveBeenCalledWith('value');
  });

  test('viewDocument renders with correct context (editable)', () => {
    const req = makeReq({
      document: { _id: 'abc', foo: 'bar' },
      query: { skip: 2 },
    });
    const res = makeRes();

    bson.toString.mockReturnValue('line1\nline2\nline3');
    filters.stringDocIDs.mockReturnValue('abc');

    controller.viewDocument(req, res);

    expect(res.render).toHaveBeenCalledWith('document', expect.objectContaining({
      title: expect.stringContaining('Editing Document: abc'),
      docLength: 3,
      docString: 'line1\nline2\nline3',
      skip: 2,
      csrfToken: 'csrf-token',
    }));
  });

  test('viewDocument renders with correct title when readOnly', () => {
    const readOnlyConfig = { options: { readOnly: true, persistEditMode: false } };
    const readOnlyCtrl = routes(readOnlyConfig);
    const req = makeReq({ document: { _id: 'xyz' } });
    const res = makeRes();

    bson.toString.mockReturnValue('doc');
    filters.stringDocIDs.mockReturnValue('xyz');

    readOnlyCtrl.viewDocument(req, res);
    expect(res.render).toHaveBeenCalledWith('document', expect.objectContaining({
      title: expect.stringContaining('Viewing Document: xyz'),
    }));
  });

  test('checkValid returns Invalid on BSON error', () => {
    const req = makeReq({ body: { document: { bad: true } } });
    const res = makeRes();

    bson.toBSON.mockImplementation(() => { throw new Error('bad'); });
    console.error = jest.fn();

    controller.checkValid(req, res);
    expect(console.error).toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith('Invalid');
  });

  test('checkValid returns Valid when BSON conversion succeeds', () => {
    const req = makeReq({ body: { document: { good: true } } });
    const res = makeRes();

    bson.toBSON.mockReturnValue({ good: true });
    controller.checkValid(req, res);
    expect(res.send).toHaveBeenCalledWith('Valid');
  });

  describe('addDocument', () => {
    test('redirects with error when document missing', async () => {
      const req = makeReq({ body: {} });
      const res = makeRes();

      await controller.addDocument(req, res);
      expect(req.session.error).toBe('You forgot to enter a document!');
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
    });

    test('redirects with error when BSON conversion fails', async () => {
      const req = makeReq({ body: { document: 'bad' } });
      const res = makeRes();

      bson.toBSON.mockImplementation(() => { throw new Error('invalid'); });
      console.error = jest.fn();

      await controller.addDocument(req, res);
      expect(req.session.error).toBe('That document is not valid!');
      expect(console.error).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
    });

    test('successful insert redirects to collection URL', async () => {
      const req = makeReq({
        body: { document: '{ "a": 1 }' },
        collection: { insertOne: jest.fn().mockResolvedValue({}) },
      });
      const res = makeRes();

      bson.toBSON.mockReturnValue({ a: 1 });
      buildCollectionURL.mockReturnValue('/base/db/col');

      await controller.addDocument(req, res);
      expect(req.session.success).toBe('Document added!');
      expect(res.redirect).toHaveBeenCalledWith('/base/db/col');
    });

    test('failed insert redirects with error', async () => {
      const req = makeReq({
        body: { document: '{ "a": 1 }' },
        collection: { insertOne: jest.fn().mockRejectedValue(new Error('boom')) },
      });
      const res = makeRes();

      bson.toBSON.mockReturnValue({ a: 1 });
      console.error = jest.fn();

      await controller.addDocument(req, res);
      expect(req.session.error).toContain('Something went wrong:');
      expect(console.error).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
    });
  });

  describe('updateDocument', () => {
    const baseReq = {
      body: { document: '{ "x": 2 }' },
      document: { _id: 'docId', old: true },
      collection: { replaceOne: jest.fn() },
      query: { skip: 5, key: 'k' },
    };

    test('missing document triggers error redirect', async () => {
      const req = makeReq({ body: {} });
      const res = makeRes();

      await controller.updateDocument(req, res);
      expect(req.session.error).toBe('You forgot to enter a document!');
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
    });

    test('BSON conversion error triggers error redirect', async () => {
      const req = makeReq({ body: { document: 'bad' } });
      const res = makeRes();

      bson.toBSON.mockImplementation(() => { throw new Error('bad'); });
      console.error = jest.fn();

      await controller.updateDocument(req, res);
      expect(req.session.error).toBe('That document is not valid!');
      expect(console.error).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
    });

    test('successful replace with persistEditMode true redirects to document URL', async () => {
      const cfg = { options: { readOnly: false, persistEditMode: true } };
      const ctrl = routes(cfg);
      const req = makeReq({
        ...baseReq,
        collection: { replaceOne: jest.fn().mockResolvedValue({}) },
      });
      const res = makeRes();

      bson.toBSON.mockReturnValue({ x: 2 });
      buildDocumentURL.mockReturnValue('/doc/url');

      await ctrl.updateDocument(req, res);
      expect(req.session.success).toBe('Document updated!');
      expect(buildDocumentURL).toHaveBeenCalledWith(
        '/base',
        req.dbName,
        req.collectionName,
        req.document._id,
        expect.objectContaining({ skip: 5, key: 'k' })
      );
      expect(res.redirect).toHaveBeenCalledWith('/doc/url');
    });

    test('successful replace with persistEditMode false redirects to collection URL', async () => {
      const cfg = { options: { readOnly: false, persistEditMode: false } };
      const ctrl = routes(cfg);
      const req = makeReq({
        ...baseReq,
        collection: { replaceOne: jest.fn().mockResolvedValue({}) },
      });
      const res = makeRes();

      bson.toBSON.mockReturnValue({ x: 2 });
      buildCollectionURL.mockReturnValue('/coll/url');

      await ctrl.updateDocument(req, res);
      expect(req.session.success).toBe('Document updated!');
      expect(buildCollectionURL).toHaveBeenCalledWith(
        '/base',
        req.dbName,
        req.collectionName,
        expect.objectContaining({ skip: 5, key: 'k' })
      );
      expect(res.redirect).toHaveBeenCalledWith('/coll/url');
    });

    test('replaceOne rejection redirects with error', async () => {
      const req = makeReq({
        ...baseReq,
        collection: { replaceOne: jest.fn().mockRejectedValue(new Error('fail')) },
      });
      const res = makeRes();

      bson.toBSON.mockReturnValue({ x: 2 });
      console.error = jest.fn();

      await controller.updateDocument(req, res);
      expect(req.session.error).toContain('Something went wrong:');
      expect(console.error).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
    });
  });

  describe('deleteDocument', () => {
    test('successful delete redirects to collection URL with view params', async () => {
      const req = makeReq({
        document: { _id: 'delId' },
        query: { sort: 'asc' },
        collection: { deleteOne: jest.fn().mockResolvedValue({}) },
      });
      const res = makeRes();

      filters.stringDocIDs.mockReturnValue('delId');
      buildCollectionURL.mockReturnValue('/after/delete');

      await controller.deleteDocument(req, res);
      expect(req.session.success).toBe('Document deleted! _id: delId');
      expect(buildCollectionURL).toHaveBeenCalledWith(
        '/base',
        req.dbName,
        req.collectionName,
        expect.objectContaining({ sort: 'asc' })
      );
      expect(res.redirect).toHaveBeenCalledWith('/after/delete');
    });

    test('delete rejection redirects with error', async () => {
      const req = makeReq({
        document: { _id: 'delId' },
        collection: { deleteOne: jest.fn().mockRejectedValue(new Error('boom')) },
      });
      const res = makeRes();

      console.error = jest.fn();

      await controller.deleteDocument(req, res);
      expect(req.session.error).toContain('Something went wrong!');
      expect(console.error).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/referrer');
    });
  });
});