import {
  datesOverlap,
  decideScan,
  deriveOrderStatus,
  normalizeTransportVin,
  parseTowType,
  tripCanComplete,
  vehicleCapacity,
} from './transport.rules';

const line = (id: string, vin: string | null, status: string, o = 'A', d = 'B') => ({
  id,
  vin,
  status,
  origin_id: o,
  destination_id: d,
});

describe('transport rules', () => {
  it('normalizes VINs and rejects invalid ones', () => {
    expect(normalizeTransportVin(' mgeeh40fxtj009399 ')).toBe('MGEEH40FXTJ009399');
    expect(() => normalizeTransportVin('ABC')).toThrow();
  });

  it('maps offline armada spellings', () => {
    expect(parseTowType('tansa')).toBe('TANSYA');
    expect(parseTowType('Towing')).toBe('TOWING');
    expect(parseTowType(' cc ')).toBe('CC');
    expect(parseTowType('')).toBeNull();
    expect(() => parseTowType('truck')).toThrow();
  });

  it('uses confirmed default capacities unless the vehicle overrides', () => {
    expect(vehicleCapacity('CC', null)).toBe(6);
    expect(vehicleCapacity('TANSYA', undefined)).toBe(4);
    expect(vehicleCapacity('TOWING', null)).toBe(1);
    expect(vehicleCapacity('CC', 8)).toBe(8);
  });

  describe('decideScan', () => {
    it('picks a planned VIN and is idempotent after pickup', () => {
      expect(decideScan('V1', [line('1', 'V1', 'DISPATCHED')])).toEqual({
        kind: 'PICK',
        lineId: '1',
        bindVin: false,
      });
      expect(decideScan('V1', [line('1', 'V1', 'PICKED_UP')])).toEqual({
        kind: 'ALREADY_PICKED',
        lineId: '1',
      });
    });

    it('binds to an empty line when only one route is open', () => {
      const lines = [line('1', null, 'DISPATCHED'), line('2', null, 'DISPATCHED')];
      expect(decideScan('V9', lines)).toEqual({ kind: 'PICK', lineId: '1', bindVin: true });
    });

    it('asks the driver to choose when empty lines span several routes', () => {
      const lines = [
        line('1', null, 'DISPATCHED', 'A', 'B'),
        line('2', null, 'DISPATCHED', 'A', 'C'),
        line('3', null, 'DISPATCHED', 'A', 'B'),
      ];
      expect(decideScan('V9', lines)).toEqual({ kind: 'CHOOSE', lineIds: ['1', '2'] });
      expect(decideScan('V9', lines, '2')).toEqual({ kind: 'PICK', lineId: '2', bindVin: true });
    });

    it('flags unplanned VINs when no empty line is left', () => {
      expect(decideScan('V9', [line('1', 'V1', 'DISPATCHED')])).toEqual({ kind: 'UNPLANNED' });
    });

    it('rejects a chosen line that already has a VIN', () => {
      expect(() => decideScan('V9', [line('1', 'V1', 'DISPATCHED')], '1')).toThrow();
    });
  });

  it('derives order status from its lines', () => {
    expect(deriveOrderStatus(['DELIVERED', 'IN_TRANSIT'])).toBe('OPEN');
    expect(deriveOrderStatus(['DELIVERED', 'CANCELLED', 'CLOSED'])).toBe('COMPLETED');
    expect(deriveOrderStatus(['CANCELLED', 'CANCELLED'])).toBe('CANCELLED');
  });

  it('completes a trip only when every loaded vehicle is delivered or closed', () => {
    expect(tripCanComplete(['DELIVERED', 'IN_TRANSIT'])).toBe(false);
    expect(tripCanComplete(['DELIVERED', 'CLOSED'])).toBe(true);
    expect(tripCanComplete([])).toBe(false);
  });

  it('detects overlapping tariff periods', () => {
    expect(datesOverlap('2026-01-01', '2026-06-30', '2026-06-30', null)).toBe(true);
    expect(datesOverlap('2026-01-01', '2026-06-30', '2026-07-01', null)).toBe(false);
    expect(datesOverlap('2026-01-01', null, '2027-01-01', '2027-02-01')).toBe(true);
  });
});
