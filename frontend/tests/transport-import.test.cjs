const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const filename = require('node:path').join(__dirname, '../src/components/transport/excel.ts');
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const compiled = { exports: {} };
new Function('require', 'module', 'exports', output)(require, compiled, compiled.exports);
const { parseTransportRows: parse } = compiled.exports;
const { parseSupplementRows } = compiled.exports;
test('supplement accepts a VIN column and rejects duplicates/missing VINs', () => {
  assert.deepEqual(parseSupplementRows([{VIN:' vin00001 '}]), ['VIN00001']);
  assert.throws(() => parseSupplementRows([{VIN:'VIN00001'},{VIN:'vin00001'}]));
  assert.throws(() => parseSupplementRows([{Other:'VIN00001'}]));
});
const row = { CustomerRequestNo: 'REQUEST-1', Origin: 'Factory', Destination: 'Dealer', PlannedQuantity: 2, VinMode: 'LATER', VIN: '' };
test('quantity-only order needs no VIN', () => assert.equal(parse([row], 'customer')[0].vins.length, 0));
test('same reference groups VIN rows, normalizing case', () => assert.deepEqual(parse([{ ...row, VIN: 'vin00001' }, { ...row, VIN: 'VIN00002' }], 'customer')[0].vins, ['VIN00001', 'VIN00002']));
test('provided list must match quantity', () => assert.throws(() => parse([{ ...row, VinMode: 'PROVIDED', VIN: 'VIN00001' }], 'customer')));
test('reject duplicate VINs', () => assert.throws(() => parse([{ ...row, VIN: 'VIN00001' }, { ...row, VIN: 'vin00001' }], 'customer')));
test('reject conflicting routes under same reference', () => assert.throws(() => parse([row, { ...row, Origin: 'Other' }], 'customer')));
test('reject zero, negative or fractional quantities', () => { for (const q of [0, -1, 1.5]) assert.throws(() => parse([{ ...row, PlannedQuantity: q }], 'customer')); });
test('reject malformed date', () => assert.throws(() => parse([{ ...row, PlannedPickupDate: '20/09/2026' }], 'customer')));
test('reject missing route, invalid VIN and empty file', () => {
  assert.throws(() => parse([{ ...row, Destination: '' }], 'customer'));
  assert.throws(() => parse([{ ...row, VIN: '../../bad' }], 'customer'));
  assert.throws(() => parse([], 'customer'));
});
