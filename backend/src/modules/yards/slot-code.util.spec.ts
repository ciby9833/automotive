import { formatSlotCode, parseSlotCode } from './slot-code.util';

describe('slot code utility', () => {
  it('formats the canonical three-level display code', () => {
    expect(formatSlotCode('AB6', 1, 4)).toBe('AB6-01-04');
    expect(formatSlotCode('D1', 20, 15)).toBe('D1-20-15');
  });

  it('parses batch-import display codes without accepting legacy two-level codes', () => {
    expect(parseSlotCode('AB6-01-04')).toEqual({
      zoneCode: 'AB6',
      line: 1,
      row: 4,
    });
    expect(parseSlotCode('A-01')).toBeNull();
    expect(parseSlotCode('AB6-00-01')).toBeNull();
  });
});
