/* Run with: node tests/depreciation.test.js
   Expected figures are worked by hand in the comments so the calculations can be checked independently. */
var D = require('../js/depreciation.js');
var assert = require('assert');
var S = { fyStartMonth: 7, fyStartDay: 16, tier1End: '01-14', tier2End: '04-13', capThreshold: 0, itaOpeningFy: '', itaOpening: { A: 0, B: 0, C: 0, D: 0 } };
var near = function (a, b, msg) { assert.ok(Math.abs(a - b) < 0.02, msg + ': got ' + a + ', expected ' + b); };

// Fiscal year boundaries
assert.strictEqual(D.fyOf('2026-07-15', S), 2025);
assert.strictEqual(D.fyOf('2026-07-16', S), 2026);
assert.strictEqual(D.fyEnd(2025, S), '2026-07-15');
assert.strictEqual(D.fyLabel(2026), '2026/27 (BS 2083/84)');

var ws = { id: 'A1', ownership: 'NAAMII', cost: 650000, acquisitionDate: '2025-08-20', usefulLifeYears: 4, residualValue: 0, itaBlock: 'B' };
var laptop = { id: 'A2', ownership: 'NAAMII', cost: 185000, acquisitionDate: '2026-02-10', usefulLifeYears: 4, residualValue: 0, itaBlock: 'B' };
var desks = { id: 'A3', ownership: 'NAAMII', cost: 96000, acquisitionDate: '2026-05-05', usefulLifeYears: 7, residualValue: 0, itaBlock: 'B' };
var printer = { id: 'A4', ownership: 'NAAMII', cost: 45000, acquisitionDate: '2023-10-01', usefulLifeYears: 5, residualValue: 0, itaBlock: 'B' };
var funderOwned = { id: 'F1', ownership: 'Funder', cost: 720000, acquisitionDate: '2025-11-03', usefulLifeYears: 5, itaBlock: 'D' };
var all = [ws, laptop, desks, printer, funderOwned];

// Ownership rule: funder-owned assets are never capitalised or depreciated
assert.strictEqual(D.isCapitalised(funderOwned, S), false);
assert.strictEqual(D.treatment(funderOwned, S), 'Expensed to project (memo record)');
assert.ok(!D.slSchedule(all, [], S, 2025).some(function (r) { return r.id === 'F1'; }));

// Straight-line: 20 Aug 2025 to 15 Jul 2026 = 330 days; 650,000 x 330 / (4 x 365) = 146,917.81
near(D.slAccumulated(ws, '2026-07-15'), 146917.81, 'SL first-year');
var row = D.slSchedule(all, [], S, 2025).filter(function (r) { return r.id === 'A1'; })[0];
near(row.depForYear, 146917.81, 'SL schedule FY2025'); near(row.nbv, 503082.19, 'NBV FY2025');
// Full second year = 650,000 / 4 = 162,500
near(D.slSchedule(all, [], S, 2026).filter(function (r) { return r.id === 'A1'; })[0].depForYear, 162500, 'SL full year');
// Never below residual
near(D.slAccumulated(Object.assign({}, ws, { residualValue: 50000 }), '2040-01-01'), 600000, 'SL cap at depreciable amount');

// Title transfer: depreciation runs on the take-on value from the transfer date only
var vested = { id: 'T1', ownership: 'NAAMII', cost: 720000, acquisitionDate: '2025-11-03', depStartDate: '2026-07-16', depBaseValue: 100000, usefulLifeYears: 2, itaBlock: 'D' };
assert.strictEqual(D.slAccumulated(vested, '2026-07-15'), 0);
near(D.slSchedule([vested], [], S, 2026)[0].depForYear, 50000, 'take-on value depreciation');

// Capitalisation threshold
assert.strictEqual(D.isCapitalised(printer, Object.assign({}, S, { capThreshold: 50000 })), false);

// ITA addition tiers (Sch. 2 s.2(5))
assert.strictEqual(D.additionTier('2025-08-20', S), 3);
assert.strictEqual(D.additionTier('2026-01-14', S), 3);
assert.strictEqual(D.additionTier('2026-01-15', S), 2);
assert.strictEqual(D.additionTier('2026-04-14', S), 1);

// ITA Block B pool, built from assets:
// FY2023: 45,000 x 25% = 11,250 -> closing 33,750
// FY2024: 33,750 x 25% = 8,437.50 -> closing 25,312.50
// FY2025: 25,312.50 + 650,000 + 185,000 x 2/3 + 96,000 x 1/3 = 830,645.83; x 25% = 207,661.46; closing 622,984.37
// FY2026: 622,984.37 + deferred (61,666.67 + 64,000) = 748,651.04; x 25% = 187,162.76
var b = function (fy, d) { return D.itaSchedule(all, d || [], S, fy).blocks.filter(function (x) { return x.block === 'B'; })[0]; };
near(b(2023).depreciation, 11250, 'ITA FY2023');
near(b(2024).closing, 25312.5, 'ITA FY2024 closing');
near(b(2025).base, 830645.83, 'ITA FY2025 base'); near(b(2025).depreciation, 207661.46, 'ITA FY2025 dep'); near(b(2025).deferredOut, 125666.67, 'ITA deferred');
near(b(2026).base, 748651.04, 'ITA FY2026 base'); near(b(2026).depreciation, 187162.76, 'ITA FY2026 dep');
// Funder-owned asset never enters Block D
near(D.itaSchedule(all, [], S, 2025).blocks.filter(function (x) { return x.block === 'D'; })[0].base, 0, 'Block D excludes funder asset');

// Disposal: auction proceeds reduce the pool; book NBV stops at the disposal date
var sale = [{ assetId: 'A4', status: 'Completed', completedDate: '2026-08-01', proceeds: 5000 }];
near(b(2026, sale).base, 743651.04, 'ITA proceeds reduce pool');
var pr = D.slSchedule(all, sale, S, 2026).filter(function (r) { return r.id === 'A4'; })[0];
assert.strictEqual(pr.nbv, 0); assert.strictEqual(pr.disposedOn, '2026-08-01');
// printer: 45,000 / (5 x 365) per day; 1 Oct 2023 to 1 Aug 2026 = 1,036 days -> 25,545.21 accumulated; NBV 19,454.79
near(pr.nbvAtDisposal, 19454.79, 'NBV at disposal');
// Excess proceeds over the pool are flagged as income (s.4(1)); small balances under Rs 2,000 are written off (s.2(6))
var tiny = [{ id: 'S1', ownership: 'NAAMII', cost: 2400, acquisitionDate: '2025-08-01', usefulLifeYears: 3, itaBlock: 'C' }];
var c = D.itaSchedule(tiny, [], S, 2025).blocks[2];
near(c.depreciation, 2400, 'small balance written off'); near(c.closing, 0, 'small balance closing');
near(D.itaSchedule(tiny, [{ assetId: 'S1', status: 'Completed', completedDate: '2025-09-01', proceeds: 3000 }], S, 2025).blocks[2].excess, 600, 'excess proceeds');

// Opening pool balances from settings
var S2 = Object.assign({}, S, { itaOpeningFy: 2026, itaOpening: { A: 0, B: 1000000, C: 0, D: 0 } });
near(D.itaSchedule(all, [], S2, 2026).blocks[1].depreciation, 250000, 'opening balance pool');

console.log('All depreciation checks passed.');
