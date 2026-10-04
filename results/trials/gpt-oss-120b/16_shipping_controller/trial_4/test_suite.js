import { jest } from '@jest/globals';
import {
  validateShippingAddress,
  calculateShippingRates,
  AddressValidationService,
  CarrierRateService
} from '../dataset/16_shipping_controller.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('validateShippingAddress', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns 200 with normalized address for valid US address', async () => {
    const req = {
      body: {
        street: ' 123 Main St ',
        city: ' New York ',
        state: ' ny ',
        postalCode: '10001',
        country: 'us'
      }
    };
    const res = mockRes();

    await validateShippingAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonPayload = res.json.mock.calls[0][0];
    expect(jsonPayload.success).toBe(true);
    expect(jsonPayload.data.isValid).toBe(true);
    expect(jsonPayload.data.normalized).toEqual({
      street: '123 Main St',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      country: 'US'
    });
  });

  test('returns 400 when required fields are missing', async () => {
    const req = { body: { city: 'Boston', state: 'MA', postalCode: '02108' } };
    const res = mockRes();

    await validateShippingAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/Incomplete address/);
  });

  test('returns 422 for a restricted country', async () => {
    const req = {
      body: {
        street: '1 Infinite Loop',
        city: 'Cupertino',
        state: 'CA',
        postalCode: '95014',
        country: 'ir'
      }
    };
    const res = mockRes();

    await validateShippingAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].error).toMatch(/Shipping is not available/);
  });

  test('returns 400 for invalid US postal code format', async () => {
    const req = {
      body: {
        street: '500 Market St',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '941', // invalid
        country: 'US'
      }
    };
    const res = mockRes();

    await validateShippingAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/Invalid US postal code/);
  });

  test('passes for non‑US country without zip validation', async () => {
    const req = {
      body: {
        street: '10 Downing St',
        city: 'London',
        state: '',
        postalCode: 'SW1A 2AA',
        country: 'GB'
      }
    };
    const res = mockRes();

    await validateShippingAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.normalized.country).toBe('GB');
  });

  test('returns 500 when AddressValidationService throws', async () => {
    jest.spyOn(AddressValidationService, 'verify').mockRejectedValue(new Error('service down'));

    const req = {
      body: {
        street: '123 Elm St',
        city: 'Seattle',
        state: 'WA',
        postalCode: '98101',
        country: 'US'
      }
    };
    const res = mockRes();

    await validateShippingAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error).toBe('Address validation failed');
    expect(res.json.mock.calls[0][0].details).toBe('service down');
  });
});

describe('calculateShippingRates', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('calculates rates with volumetric weight higher than actual weight', async () => {
    const req = {
      body: {
        destination: { country: 'US', postalCode: '90210' },
        packageDetails: {
          weightKg: 2,
          dimensions: { length: 100, width: 50, height: 50 } // volumetric = 100*50*50/5000 = 50 kg
        }
      }
    };
    const res = mockRes();

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.isVolumetric).toBe(true);
    expect(payload.data.billableWeightKg).toBeCloseTo(50);
    expect(payload.data.options).toHaveLength(3);
    expect(payload.data.options[0]).toMatchObject({
      service: 'standard',
      currency: 'USD'
    });
  });

  test('calculates rates with actual weight as billable weight', async () => {
    const req = {
      body: {
        destination: { country: 'CA', postalCode: 'M5V' },
        packageDetails: {
          weightKg: 10,
          dimensions: { length: 30, width: 20, height: 15 } // volumetric = 0.18 kg
        }
      }
    };
    const res = mockRes();

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.isVolumetric).toBe(false);
    expect(payload.data.billableWeightKg).toBeCloseTo(10);
  });

  test('returns 400 when destination data is incomplete', async () => {
    const req = { body: { destination: { country: 'US' } } };
    const res = mockRes();

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/Destination country and postalCode/);
  });

  test('returns 422 for a restricted destination country', async () => {
    const req = {
      body: {
        destination: { country: 'KP', postalCode: '12345' },
        packageDetails: {
          weightKg: 5,
          dimensions: { length: 10, width: 10, height: 10 }
        }
      }
    };
    const res = mockRes();

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].error).toMatch(/Carrier does not ship/);
  });

  test('returns 400 when packageDetails missing weightKg', async () => {
    const req = {
      body: {
        destination: { country: 'US', postalCode: '30301' },
        packageDetails: { dimensions: { length: 10, width: 10, height: 10 } }
      }
    };
    const res = mockRes();

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/Package weightKg must be a positive number/);
  });

  test('returns 400 when dimensions are invalid', async () => {
    const req = {
      body: {
        destination: { country: 'US', postalCode: '30301' },
        packageDetails: {
          weightKg: 5,
          dimensions: { length: -10, width: 10, height: 10 }
        }
      }
    };
    const res = mockRes();

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/Valid dimensions/);
  });

  test('returns 500 when CarrierRateService throws', async () => {
    jest.spyOn(CarrierRateService, 'getRates').mockRejectedValue(new Error('rate service down'));

    const req = {
      body: {
        destination: { country: 'US', postalCode: '10001' },
        packageDetails: {
          weightKg: 3,
          dimensions: { length: 20, width: 20, height: 20 }
        }
      }
    };
    const res = mockRes();

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error).toBe('Failed to compute shipping rates');
    expect(res.json.mock.calls[0][0].details).toBe('rate service down');
  });
});