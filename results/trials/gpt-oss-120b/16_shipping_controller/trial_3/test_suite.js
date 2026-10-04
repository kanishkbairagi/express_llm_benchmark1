import { jest } from '@jest/globals';
import {
  validateShippingAddress,
  calculateShippingRates,
  AddressValidationService,
  CarrierRateService
} from '../dataset/16_shipping_controller.js';

describe('validateShippingAddress', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when required fields are missing', async () => {
    const req = { body: { city: 'NY', state: 'NY', postalCode: '10001' } };
    const res = mockRes();

    await validateShippingAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Incomplete address: street, city, state, and postalCode are required'
    });
  });

  test('returns 422 for restricted country', async () => {
    const req = {
      body: {
        street: '123 Main St',
        city: 'Paris',
        state: 'N/A',
        postalCode: '75001',
        country: 'ir'
      }
    };
    const res = mockRes();

    await validateShippingAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Shipping is not available to destination country code "IR"'
    });
  });

  test('returns 400 for invalid US postal code', async () => {
    const req = {
      body: {
        street: '456 Elm St',
        city: 'Boston',
        state: 'MA',
        postalCode: '1234', // invalid
        country: 'US'
      }
    };
    const res = mockRes();

    await validateShippingAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid US postal code format (expected 12345 or 12345-6789)'
    });
  });

  test('successful address verification returns 200 with normalized data', async () => {
    const req = {
      body: {
        street: ' 789 Oak Ave ',
        city: 'Seattle ',
        state: ' wa ',
        postalCode: '98101',
        country: 'us'
      }
    };
    const res = mockRes();

    const verifySpy = jest.spyOn(AddressValidationService, 'verify');

    await validateShippingAddress(req, res);

    expect(verifySpy).toHaveBeenCalledWith({
      street: ' 789 Oak Ave ',
      city: 'Seattle ',
      state: ' wa ',
      postalCode: '98101',
      country: 'US'
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Address verified',
      data: {
        isValid: true,
        normalized: {
          street: '789 Oak Ave',
          city: 'Seattle',
          state: 'WA',
          postalCode: '98101',
          country: 'US'
        }
      }
    });
  });

  test('handles verification service error with 500', async () => {
    const req = {
      body: {
        street: '123 Test',
        city: 'Testville',
        state: 'TX',
        postalCode: '75001',
        country: 'US'
      }
    };
    const res = mockRes();

    jest.spyOn(AddressValidationService, 'verify').mockImplementation(() => {
      throw new Error('service down');
    });

    await validateShippingAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Address validation failed',
      details: 'service down'
    });
  });
});

describe('calculateShippingRates', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when destination data is incomplete', async () => {
    const req = { body: { destination: { postalCode: '12345' }, packageDetails: {} } };
    const res = mockRes();

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Destination country and postalCode are required'
    });
  });

  test('returns 422 for restricted destination country', async () => {
    const req = {
      body: {
        destination: { country: 'KP', postalCode: '12345' },
        packageDetails: { weightKg: 2, dimensions: { length: 10, width: 10, height: 10 } }
      }
    };
    const res = mockRes();

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Carrier does not ship to "KP"'
    });
  });

  test('returns 400 when packageDetails missing', async () => {
    const req = {
      body: {
        destination: { country: 'US', postalCode: '90210' }
        // packageDetails omitted
      }
    };
    const res = mockRes();

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'packageDetails object is required'
    });
  });

  test('returns 400 for non‑positive weightKg', async () => {
    const req = {
      body: {
        destination: { country: 'US', postalCode: '90210' },
        packageDetails: { weightKg: -1, dimensions: { length: 10, width: 10, height: 10 } }
      }
    };
    const res = mockRes();

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Package weightKg must be a positive number'
    });
  });

  test('returns 400 for invalid dimensions', async () => {
    const req = {
      body: {
        destination: { country: 'US', postalCode: '90210' },
        packageDetails: { weightKg: 2, dimensions: { length: 0, width: 10, height: 10 } }
      }
    };
    const res = mockRes();

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Valid dimensions (length, width, height > 0) in cm are required'
    });
  });

  test('successful rate calculation uses volumetric weight when greater', async () => {
    const req = {
      body: {
        destination: { country: 'US', postalCode: '30301' },
        packageDetails: {
          weightKg: 1,
          dimensions: { length: 100, width: 50, height: 40 } // volumetric = 100*50*40/5000 = 40kg
        }
      }
    };
    const res = mockRes();

    const getRatesSpy = jest.spyOn(CarrierRateService, 'getRates');

    await calculateShippingRates(req, res);

    // Verify billable weight calculated as volumetric (40)
    expect(getRatesSpy).toHaveBeenCalledWith(40, 'US');

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
    expect(jsonArg.data.billableWeightKg).toBeCloseTo(40);
    expect(jsonArg.data.isVolumetric).toBe(true);
    expect(Array.isArray(jsonArg.data.options)).toBe(true);
    // Verify each option format
    jsonArg.data.options.forEach((opt) => {
      expect(opt).toHaveProperty('service');
      expect(opt).toHaveProperty('cost');
      expect(opt).toHaveProperty('currency', 'USD');
      expect(opt).toHaveProperty('estimatedDelivery');
    });
  });

  test('successful rate calculation uses actual weight when higher', async () => {
    const req = {
      body: {
        destination: { country: 'US', postalCode: '30301' },
        packageDetails: {
          weightKg: 30,
          dimensions: { length: 30, width: 30, height: 30 } // volumetric = 30*30*30/5000 = 5.4kg
        }
      }
    };
    const res = mockRes();

    const getRatesSpy = jest.spyOn(CarrierRateService, 'getRates');

    await calculateShippingRates(req, res);

    expect(getRatesSpy).toHaveBeenCalledWith(30, 'US');

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
    expect(jsonArg.data.billableWeightKg).toBeCloseTo(30);
    expect(jsonArg.data.isVolumetric).toBe(false);
  });

  test('handles carrier service error with 500', async () => {
    const req = {
      body: {
        destination: { country: 'US', postalCode: '30301' },
        packageDetails: {
          weightKg: 5,
          dimensions: { length: 20, width: 20, height: 20 }
        }
      }
    };
    const res = mockRes();

    jest.spyOn(CarrierRateService, 'getRates').mockImplementation(() => {
      throw new Error('rate service down');
    });

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to compute shipping rates',
      details: 'rate service down'
    });
  });
});