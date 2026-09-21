import { jest } from '@jest/globals';
import {
  AddressValidationService,
  CarrierRateService,
  validateShippingAddress,
  calculateShippingRates
} from '../dataset/16_shipping_controller.js';

describe('Shipping Controller', () => {
  let req;
  let res;

  beforeEach(() => {
    req = { body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  describe('validateShippingAddress', () => {
    it('should return 400 if required address fields are missing', async () => {
      req.body = { street: '123 Main St', city: 'Springfield' };

      await validateShippingAddress(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Incomplete address: street, city, state, and postalCode are required'
      });
    });

    it('should return 400 if req.body is undefined', async () => {
      req.body = undefined;

      await validateShippingAddress(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Incomplete address: street, city, state, and postalCode are required'
      });
    });

    it('should return 422 if shipping country is restricted', async () => {
      req.body = {
        street: '123 Main St',
        city: 'Havana',
        state: 'Havana',
        postalCode: '10100',
        country: 'cu'
      };

      await validateShippingAddress(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Shipping is not available to destination country code "CU"'
      });
    });

    it('should return 400 for an invalid US postal code format', async () => {
      req.body = {
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        postalCode: '1234',
        country: 'US'
      };

      await validateShippingAddress(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid US postal code format (expected 12345 or 12345-6789)'
      });
    });

    it('should accept valid US postal code formats and normalize inputs', async () => {
      req.body = {
        street: '123 Main St ',
        city: 'Springfield ',
        state: 'il ',
        postalCode: '12345-6789 ',
        country: 'us '
      };

      await validateShippingAddress(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Address verified',
        data: {
          isValid: true,
          normalized: {
            street: '123 Main St',
            city: 'Springfield',
            state: 'IL',
            postalCode: '12345-6789',
            country: 'US'
          }
        }
      });
    });

    it('should validate non-US addresses without US zip code format restrictions', async () => {
      req.body = {
        street: '100 Queen St',
        city: 'Toronto',
        state: 'ON',
        postalCode: 'M5H 2N2',
        country: 'CA'
      };

      await validateShippingAddress(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Address verified',
        data: expect.objectContaining({
          isValid: true,
          normalized: expect.objectContaining({
            country: 'CA',
            postalCode: 'M5H 2N2'
          })
        })
      });
    });

    it('should return 500 when AddressValidationService throws an error', async () => {
      jest.spyOn(AddressValidationService, 'verify').mockRejectedValueOnce(new Error('Validation service error'));

      req.body = {
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        postalCode: '62701'
      };

      await validateShippingAddress(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Address validation failed',
        details: 'Validation service error'
      });
    });
  });

  describe('calculateShippingRates', () => {
    it('should return 400 if destination is missing or incomplete', async () => {
      req.body = { destination: { country: 'US' } };

      await calculateShippingRates(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Destination country and postalCode are required'
      });
    });

    it('should return 422 if destination country is restricted', async () => {
      req.body = {
        destination: { country: 'IR', postalCode: '12345' }
      };

      await calculateShippingRates(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Carrier does not ship to "IR"'
      });
    });

    it('should return 400 if packageDetails is missing or invalid type', async () => {
      req.body = {
        destination: { country: 'US', postalCode: '90210' },
        packageDetails: null
      };

      await calculateShippingRates(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'packageDetails object is required'
      });
    });

    it('should return 400 if weightKg is missing or <= 0', async () => {
      req.body = {
        destination: { country: 'US', postalCode: '90210' },
        packageDetails: { weightKg: 0 }
      };

      await calculateShippingRates(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Package weightKg must be a positive number'
      });
    });

    it('should return 400 if package dimensions are invalid or <= 0', async () => {
      req.body = {
        destination: { country: 'US', postalCode: '90210' },
        packageDetails: {
          weightKg: 2,
          dimensions: { length: 10, width: 0, height: 10 }
        }
      };

      await calculateShippingRates(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Valid dimensions (length, width, height > 0) in cm are required'
      });
    });

    it('should calculate rates using actual weight when actual weight is greater than volumetric weight', async () => {
      req.body = {
        destination: { country: 'US', postalCode: '90210' },
        packageDetails: {
          weightKg: 5,
          dimensions: { length: 10, width: 10, height: 10 }
        }
      };

      await calculateShippingRates(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          billableWeightKg: 5,
          isVolumetric: false,
          options: [
            { service: 'standard', cost: 17.5, currency: 'USD', estimatedDelivery: '3-5 business days' },
            { service: 'express', cost: 37, currency: 'USD', estimatedDelivery: '1-2 business days' },
            { service: 'overnight', cost: 70, currency: 'USD', estimatedDelivery: 'Next business day' }
          ]
        }
      });
    });

    it('should calculate rates using volumetric weight when volumetric weight is greater', async () => {
      req.body = {
        destination: { country: 'US', postalCode: '90210' },
        packageDetails: {
          weightKg: 1,
          dimensions: { length: 50, width: 50, height: 50 }
        }
      };

      await calculateShippingRates(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          billableWeightKg: 25,
          isVolumetric: true,
          options: [
            { service: 'standard', cost: 67.5, currency: 'USD', estimatedDelivery: '3-5 business days' },
            { service: 'express', cost: 137, currency: 'USD', estimatedDelivery: '1-2 business days' },
            { service: 'overnight', cost: 250, currency: 'USD', estimatedDelivery: 'Next business day' }
          ]
        }
      });
    });

    it('should return 500 when CarrierRateService throws an error', async () => {
      jest.spyOn(CarrierRateService, 'getRates').mockRejectedValueOnce(new Error('Rate service error'));

      req.body = {
        destination: { country: 'US', postalCode: '90210' },
        packageDetails: {
          weightKg: 2,
          dimensions: { length: 10, width: 10, height: 10 }
        }
      };

      await calculateShippingRates(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to compute shipping rates',
        details: 'Rate service error'
      });
    });
  });
});