import { jest } from '@jest/globals';
import routes from '../dataset/external/mongo-express__mongo-express/lib/routes/document.js';
import * as bson from '../bson.js';
import * as filters from '../filters.js';
import { buildCollectionURL, buildDocumentURL } from '../utils.js';

jest.mock('../bson.js');
jest.mock('../filters.js');
jest.mock('../utils.js');

describe('Document Routes', () => {
  let req;
  let res;
  let config;
  let routeHandlers;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    config = {
      options: {
        readOnly: false,
        persistEditMode: false,
      },
    };

    routeHandlers = routes(config);

    req = {
      prop: 'someProperty',
      document: { _id: '12345', name: 'Test Doc' },
      query: {},
      body: {},
      session: {},
      dbName: 'testDb',
      collectionName: 'testCollection',
      csrfToken: jest.fn().mockReturnValue('csrf-token-123'),
      get: jest.fn(),
      collection: {
        insertOne: jest.fn(),
        replaceOne: jest.fn(),
        deleteOne: jest.fn(),
      },
    };

    res = {
      send: jest.fn(),
      render: jest.fn(),
      redirect: jest.fn(),
      locals: {
        baseHref: '/db/',
      },
    };

    buildCollectionURL.mockReturnValue('/collection-url');
    buildDocumentURL.mockReturnValue('/document-url');
    filters.stringDocIDs.mockImplementation((id) => String(id));
    bson.toString.mockReturnValue('line1\nline2');
    bson.toBSON.mockImplementation((doc) => ({ ...doc, parsed: true }));
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  describe('getProperty', () => {
    test('should send req.prop property', () => {
      routeHandlers.getProperty(req, res);
      expect(res.send).toHaveBeenCalledWith('someProperty');
    });
  });

  describe('viewDocument', () => {
    test('should render document view with Editing title when readOnly is false', () => {
      routeHandlers.viewDocument(req, res);
      expect(res.render).toHaveBeenCalledWith('document', {
        title: 'Editing Document: 12345',
        docLength: 2,
        docString: 'line1\nline2',
        skip: 0,
        csrfToken: 'csrf-token-123',
      });
    });

    test('should render document view with Viewing title when readOnly is true', () => {
      config.options.readOnly = true;
      routeHandlers.viewDocument(req, res);
      expect(res.render).toHaveBeenCalledWith('document', expect.objectContaining({
        title: 'Viewing Document: 12345',
      }));
    });

    test('should use skip parameter from req.query if present', () => {
      req.query.skip = 10;
      routeHandlers.viewDocument(req, res);
      expect(res.render).toHaveBeenCalledWith('document', expect.objectContaining({
        skip: 10,
      }));
    });
  });

  describe('checkValid', () => {
    test('should send Valid if document is valid BSON', () => {
      req.body.document = '{"a": 1}';
      routeHandlers.checkValid(req, res);
      expect(bson.toBSON).toHaveBeenCalledWith('{"a": 1}');
      expect(res.send).toHaveBeenCalledWith('Valid');
    });

    test('should send Invalid if bson.toBSON throws error', () => {
      req.body.document = 'invalid bson';
      bson.toBSON.mockImplementationOnce(() => {
        throw new Error('Parse error');
      });
      routeHandlers.checkValid(req, res);
      expect(console.error).toHaveBeenCalled();
      expect(res.send).toHaveBeenCalledWith('Invalid');
    });
  });

  describe('addDocument', () => {
    test('should set session error and redirect if document is undefined or empty', async () => {
      req.get.mockReturnValue('/referrer-url');

      await routeHandlers.addDocument(req, res);

      expect(req.session.error).toBe('You forgot to enter a document!');
      expect(res.redirect).toHaveBeenCalledWith('/referrer-url');
    });

    test('should fallback to / when referrer is not present and doc is empty', async () => {
      req.get.mockReturnValue(undefined);

      await routeHandlers.addDocument(req, res);

      expect(req.session.error).toBe('You forgot to enter a document!');
      expect(res.redirect).toHaveBeenCalledWith('/');
    });

    test('should set session error and redirect if bson conversion throws', async () => {
      req.body.document = 'bad doc';
      req.get.mockReturnValue('/referrer-url');
      bson.toBSON.mockImplementationOnce(() => {
        throw new Error('BSON Error');
      });

      await routeHandlers.addDocument(req, res);

      expect(req.session.error).toBe('That document is not valid!');
      expect(res.redirect).toHaveBeenCalledWith('/referrer-url');
    });

    test('should insert document and redirect to collection URL on success', async () => {
      req.body.document = '{"a":1}';
      req.collection.insertOne.mockResolvedValue({});

      await routeHandlers.addDocument(req, res);

      expect(req.collection.insertOne).toHaveBeenCalled();
      expect(req.session.success).toBe('Document added!');
      expect(buildCollectionURL).toHaveBeenCalledWith('/db/', 'testDb', 'testCollection');
      expect(res.redirect).toHaveBeenCalledWith('/collection-url');
    });

    test('should set session error on insert failure', async () => {
      req.body.document = '{"a":1}';
      req.collection.insertOne.mockRejectedValue(new Error('DB Error'));

      await routeHandlers.addDocument(req, res);

      expect(req.session.error).toBe('Something went wrong: Error: DB Error');
      expect(res.redirect).toHaveBeenCalledWith('/');
    });
  });

  describe('updateDocument', () => {
    test('should redirect with error if document is undefined or empty', async () => {
      await routeHandlers.updateDocument(req, res);

      expect(req.session.error).toBe('You forgot to enter a document!');
      expect(res.redirect).toHaveBeenCalledWith('/');
    });

    test('should redirect with error if bson conversion throws', async () => {
      req.body.document = 'invalid doc';
      bson.toBSON.mockImplementationOnce(() => {
        throw new Error('BSON error');
      });

      await routeHandlers.updateDocument(req, res);

      expect(req.session.error).toBe('That document is not valid!');
      expect(res.redirect).toHaveBeenCalledWith('/');
    });

    test('should update document and redirect to collection URL when persistEditMode is false', async () => {
      req.body.document = '{"name":"updated"}';
      req.collection.replaceOne.mockResolvedValue({});

      await routeHandlers.updateDocument(req, res);

      expect(req.collection.replaceOne).toHaveBeenCalledWith(
        { _id: '12345', name: 'Test Doc' },
        expect.objectContaining({ _id: '12345' })
      );
      expect(req.session.success).toBe('Document updated!');
      expect(buildCollectionURL).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/collection-url');
    });

    test('should update document and redirect to document URL when persistEditMode is true', async () => {
      config.options.persistEditMode = true;
      req.body.document = '{"name":"updated"}';
      req.collection.replaceOne.mockResolvedValue({});

      await routeHandlers.updateDocument(req, res);

      expect(req.session.success).toBe('Document updated!');
      expect(buildDocumentURL).toHaveBeenCalledWith(
        '/db/',
        'testDb',
        'testCollection',
        '12345',
        expect.any(Object)
      );
      expect(res.redirect).toHaveBeenCalledWith('/document-url');
    });

    test('should handle DB replace error', async () => {
      req.body.document = '{"name":"updated"}';
      req.collection.replaceOne.mockRejectedValue(new Error('Update failed'));

      await routeHandlers.updateDocument(req, res);

      expect(req.session.error).toBe('Something went wrong: Error: Update failed');
      expect(res.redirect).toHaveBeenCalledWith('/');
    });
  });

  describe('deleteDocument', () => {
    test('should delete document and redirect to collection URL on success', async () => {
      req.collection.deleteOne.mockResolvedValue({});

      await routeHandlers.deleteDocument(req, res);

      expect(req.collection.deleteOne).toHaveBeenCalledWith({ _id: '12345', name: 'Test Doc' });
      expect(req.session.success).toBe('Document deleted! _id: 12345');
      expect(buildCollectionURL).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/collection-url');
    });

    test('should handle delete error and redirect', async () => {
      req.collection.deleteOne.mockRejectedValue(new Error('Delete failed'));

      await routeHandlers.deleteDocument(req, res);

      expect(req.session.error).toBe('Something went wrong! Error: Delete failed');
      expect(res.redirect).toHaveBeenCalledWith('/');
    });
  });
});