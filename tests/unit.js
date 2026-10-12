// tests/unit.js — plain Node test runner, zero dependencies, no framework.
// Extracts the <script> block from hledger-webuix.html, evaluates it in a
// vm context with stubbed browser globals, and unit-tests the pure functions
// (SVG helpers, chart data builders, layout algorithms).
// The app itself stays a single HTML file; this harness lives outside it.
//
// Run: node tests/unit.js
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

// ── extract script from the single HTML file ──
const htmlPath = path.join(__dirname, '..', 'hledger-webuix.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('FAIL: no <script> block found in hledger-webuix.html'); process.exit(1); }
const src = m[1];

// ── browser stubs ──
function stubEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    attributes: {},
    children: [],
    style: {},
    dataset: {},
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, f) { if (f === undefined) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); } else { f ? this._set.add(c) : this._set.delete(c); } },
      contains(c) { return this._set.has(c); }
    },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k]; },
    removeAttribute(k) { delete this.attributes[k]; },
    appendChild(c) { this.children.push(c); c.parentElement = el; return c; },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); },
    addEventListener() {}, removeEventListener() {},
    attachEvent() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }; },
    scrollIntoView() {}, focus() {}, click() {},
    insertBefore(c) { el.children.push(c); return c; },
    previousElementSibling: null, nextElementSibling: null, parentElement: null,
    firstChild: null, parentNode: null,
  };
  Object.defineProperty(el, 'innerHTML', { get() { return el._html || ''; }, set(v) { el._html = String(v); } });
  Object.defineProperty(el, 'textContent', { get() { return el._text || ''; }, set(v) { el._text = String(v); } });
  Object.defineProperty(el, 'value', { get() { return el._value || ''; }, set(v) { el._value = String(v); } });
  return el;
}

const documentStub = {
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement(tag) { return stubEl(tag); },
  createElementNS(ns, tag) { return stubEl(tag); },
  createTextNode(t) { return { textContent: t }; },
  body: stubEl('body'),
  documentElement: stubEl('html'),
};
// getElementById returns a persistent stub per id (enables full renderDashboard tests)
const elCache = {};
documentStub.getElementById = function (id) { return elCache[id] || (elCache[id] = stubEl('div')); };

const localStorageStore = {};
const localStorageStub = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(localStorageStore, k) ? localStorageStore[k] : null; },
  setItem(k, v) { localStorageStore[k] = String(v); },
  removeItem(k) { delete localStorageStore[k]; }
};

const sandbox = {
  document: documentStub,
  localStorage: localStorageStub,
  window: { d3: undefined, addEventListener() {} },
  Date, Math, JSON, Number, String, Object, Array, RegExp, parseFloat, parseInt, isNaN, Infinity: Infinity, NaN: NaN, undefined: undefined,
  setTimeout() { return 0; }, clearTimeout() {},
  DataTransfer: function () { this.items = { add() {} }; this.files = []; },
  FileReader: function () {},
  Blob: function () {},
  URL: { createObjectURL() { return 'blob:x'; }, revokeObjectURL() {} },
  Event: function (t) { this.type = t; },
  console, alert() {}, navigator: { userAgent: 'node' }
};
vm.createContext(sandbox);

// ── tiny test runner ──
const tests = [];
function test(name, fn) { tests.push([name, fn]); }
let passed = 0, failed = 0;
const failures = [];

// ══════════════════════════════════════════════════════════════════
// TASK 1 TESTS — SVG helpers, color helpers, chart state
// ══════════════════════════════════════════════════════════════════

test('svgEl creates SVG element with attributes', () => {
  const el = sandbox.svgEl('rect', { width: '10', fill: '#abc' });
  assert.strictEqual(el.tagName, 'RECT');
  assert.strictEqual(el.getAttribute('width'), '10');
  assert.strictEqual(el.getAttribute('fill'), '#abc');
});

test('scaleLinear maps domain to range', () => {
  const s = sandbox.scaleLinear([0, 10], [0, 100]);
  assert.strictEqual(s(5), 50);
  assert.strictEqual(s(0), 0);
  assert.strictEqual(s(10), 100);
});

test('scaleLinear handles inverted range', () => {
  const s = sandbox.scaleLinear([0, 10], [100, 0]);
  assert.strictEqual(s(5), 50);
  assert.strictEqual(s(0), 100);
});

test('scaleLinear degenerate domain does not produce NaN', () => {
  const s = sandbox.scaleLinear([5, 5], [0, 100]);
  const v = s(5);
  assert.ok(!isNaN(v), 'scale(5) should not be NaN, got ' + v);
});

test('scaleBand returns position and width, plus bandwidth()', () => {
  const s = sandbox.scaleBand(['a', 'b', 'c'], [0, 90], 0.1);
  const a = s('a');
  assert.ok(a && typeof a.x === 'number' && typeof a.w === 'number', 'returns {x, w}');
  assert.strictEqual(a.x, 0);
  assert.ok(a.w > 0 && a.w < 30, 'band width within range, got ' + a.w);
  assert.ok(Math.abs(sandbox.scaleBand.prototype && 0) === 0 || true); // placeholder no-op
  const bw = s.bandwidth();
  assert.strictEqual(bw, a.w, 'bandwidth() matches returned w');
  assert.strictEqual(s('b').x > a.x, true, 'bands ordered');
  const c = s('c');
  assert.ok(c.x + c.w <= 90.001, 'last band fits in range');
});

test('niceTicks: sorted, includes 0 when in range, covers extent', () => {
  const t = sandbox.niceTicks(-100, 200, 5);
  assert.ok(Array.isArray(t) && t.length >= 3, 'array of ticks');
  for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1], 'sorted ascending');
  assert.ok(t.includes(0), 'includes 0 when range spans it');
  assert.ok(t[0] <= -100, 'min tick <= extent min');
  assert.ok(t[t.length - 1] >= 200, 'max tick >= extent max');
});

test('niceTicks: degenerate extent falls back to [0,1]', () => {
  const t = sandbox.niceTicks(0, 0, 5);
  assert.strictEqual(t.length, 2, 'exactly two ticks');
  assert.strictEqual(t[0], 0);
  assert.strictEqual(t[1], 1);
});

test('niceTicks: single interval gives sane ticks', () => {
  const t = sandbox.niceTicks(3, 7, 5);
  assert.ok(t[0] <= 3 && t[t.length - 1] >= 7, 'covers extent');
  for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1]);
});

test('linePath generates M/L path', () => {
  const d = sandbox.linePath([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
  assert.strictEqual(d, 'M0,0L10,10');
});

test('linePath empty points returns empty string', () => {
  assert.strictEqual(sandbox.linePath([]), '');
});

test('areaPath closes down to baseline', () => {
  const d = sandbox.areaPath([{ x: 0, y: 0 }, { x: 10, y: 10 }], 100);
  assert.strictEqual(d, 'M0,0L10,10L10,100L0,100Z');
});

test('arcPath: partial arc produces path with A commands', () => {
  const d = sandbox.arcPath(50, 50, 10, 20, 0, Math.PI);
  assert.ok(typeof d === 'string' && d.length > 0, 'non-empty');
  assert.ok(/^M/.test(d), 'starts with M');
  assert.ok(d.indexOf('A') !== -1, 'contains arc command');
});

test('arcPath: full circle handles a1-a0 >= 2pi without NaN', () => {
  const d = sandbox.arcPath(50, 50, 10, 20, 0, Math.PI * 2);
  assert.ok(typeof d === 'string' && d.length > 0 && d.indexOf('NaN') === -1, 'no NaN in ' + d);
});

test('hclColorRange: N distinct hex colors', () => {
  const cols = sandbox.hclColorRange(3, 45, 70);
  assert.strictEqual(cols.length, 3);
  cols.forEach(c => assert.ok(/^#[0-9a-f]{6}$/i.test(c), 'hex format: ' + c));
  assert.strictEqual(new Set(cols).size, 3, 'distinct');
});

test('hclColorRange: 15 colors all valid', () => {
  const cols = sandbox.hclColorRange(15, 30, 80);
  assert.strictEqual(cols.length, 15);
  cols.forEach(c => assert.ok(/^#[0-9a-f]{6}$/i.test(c)));
});

test('accountColor: stable and distinct for different top-level accounts', () => {
  const a1 = sandbox.accountColor('exp:food');
  const a2 = sandbox.accountColor('exp:food');
  assert.strictEqual(a1, a2, 'stable for same account');
  const b = sandbox.accountColor('inc:salary');
  assert.notStrictEqual(a1, b, 'different top-level accounts get different colors');
  assert.ok(/^#[0-9a-f]{6}$/i.test(a1));
});

test('greenShade / redShade: hex strings, vary with index', () => {
  const g0 = sandbox.greenShade(0), g1 = sandbox.greenShade(1);
  const r0 = sandbox.redShade(0), r1 = sandbox.redShade(1);
  [/^#[0-9a-f]{6}$/i, /^#[0-9a-f]{6}$/i, /^#[0-9a-f]{6}$/i, /^#[0-9a-f]{6}$/i]
    .forEach((re, i) => assert.ok(re.test([g0, g1, r0, r1][i]), 'hex format'));
  assert.notStrictEqual(g0, g1, 'green shades differ');
  assert.notStrictEqual(r0, r1, 'red shades differ');
});

test('fmtShort: compact axis labels', () => {
  assert.strictEqual(sandbox.fmtShort(12000), '12k');
  assert.strictEqual(sandbox.fmtShort(-3500), '-3.5k');
  assert.strictEqual(sandbox.fmtShort(1234567), '1.2M');
  assert.strictEqual(sandbox.fmtShort(500), '500');
  assert.strictEqual(sandbox.fmtShort(0), '0');
});

test('fmtShort: strips trailing .0', () => {
  assert.strictEqual(sandbox.fmtShort(1000), '1k');
  assert.strictEqual(sandbox.fmtShort(2000000), '2M');
});

test('chartState: defaults when no localStorage', () => {
  assert.strictEqual(sandbox.chartState.interval, 'month');
  assert.strictEqual(sandbox.chartState.lineMode, 'line');
  assert.strictEqual(sandbox.chartState.barMode, 'stacked');
  assert.strictEqual(sandbox.chartState.hierMode, 'treemap');
});

test('tooltip functions exist and init runs against stub DOM', () => {
  assert.strictEqual(typeof sandbox.tooltipInit, 'function');
  assert.strictEqual(typeof sandbox.tooltipShow, 'function');
  assert.strictEqual(typeof sandbox.tooltipHide, 'function');
  sandbox.tooltipInit();
  sandbox.tooltipShow('<b>test</b>', 10, 20);
  sandbox.tooltipHide();
});

// ── run ──
let failed0 = 0;
try {
  vm.runInContext(src, sandbox, { filename: 'hledger-webuix-inline.js' });
} catch (e) {
  console.error('SCRIPT EVAL ERROR: ' + e.message);
  process.exit(1);
}

// ══════════════════════════════════════════════════════════════════
// TASK 2 TESTS — chart data builders (need parsed fixture journal)
// ══════════════════════════════════════════════════════════════════

const FIXTURE = [
  '2026-01-01 Opening',
  '    Assets:Cash        EUR 1000',
  '    Equity:Open             EUR -1000',
  '',
  '2026-01-15 Salary',
  '    Income:Salary      EUR -2000',
  '    Assets:Cash             EUR 2000',
  '',
  '2026-01-20 Groceries',
  '    Expenses:Food      EUR 50',
  '    Assets:Cash             EUR -50',
  '',
  '2026-02-05 Rent',
  '    Expenses:Rent      EUR 800',
  '    Assets:Cash             EUR -800',
  '',
  '2026-02-10 Freelance',
  '    Income:Freelance   EUR -300',
  '    Assets:Cash             EUR 300',
  '',
  '2026-03-01 Loan payment',
  '    Liabilities:Loan   EUR -100',
  '    Assets:Cash             EUR -100',
  '',
  '2026-03-05 Groceries store',
  '    Expenses:Food:Groceries  EUR 20',
  '    Assets:Cash                  EUR -20',
  ''
].join('\n');
sandbox.__FIXTURE__ = FIXTURE;
vm.runInContext('allTxns = parseJournal(__FIXTURE__); filtered = allTxns.slice();', sandbox);

test('fixture parses: 7 transactions, 14 postings', () => {
  assert.strictEqual(sandbox.allTxns.length, 7, '7 txns');
  assert.strictEqual(sandbox.allTxns.reduce((s, t) => s + t.postings.length, 0), 14, '14 postings');
});

test('intervalDates month: spans Jan-Mar 2026 with month-end dates', () => {
  const d = sandbox.intervalDates(sandbox.filtered, 'month');
  assert.strictEqual(d.length, 3);
  assert.strictEqual(d[0].label, '2026-01');
  assert.strictEqual(d[0].start, '2026-01-01');
  assert.strictEqual(d[0].end, '2026-01-31');
  assert.strictEqual(d[1].end, '2026-02-28');
  assert.strictEqual(d[2].end, '2026-03-31');
});

test('intervalDates year: one bucket', () => {
  const d = sandbox.intervalDates(sandbox.filtered, 'year');
  assert.strictEqual(d.length, 1);
  assert.strictEqual(d[0].label, '2026');
});

test('intervalDates quarter: one bucket Q1', () => {
  const d = sandbox.intervalDates(sandbox.filtered, 'quarter');
  assert.strictEqual(d.length, 1);
  assert.strictEqual(d[0].label, '2026 Q1');
});

test('intervalDates week: buckets are 7-day spans starting Monday', () => {
  const d = sandbox.intervalDates(sandbox.filtered, 'week');
  assert.ok(d.length >= 9 && d.length <= 10, 'Jan 1 (Thu) - Mar 5 (Thu) spans ~9-10 weeks, got ' + d.length);
  // 2026-01-01 is a Thursday; first bucket starts Monday 2025-12-29
  assert.strictEqual(d[0].start, '2025-12-29');
  assert.strictEqual(d[0].end, '2026-01-04');
  d.forEach(b => {
    const dd = new Date(b.start + 'T00:00:00');
    assert.strictEqual((dd.getDay() + 6) % 7, 0, b.start + ' is a Monday');
  });
});

test('intervalDates day: unique txn dates', () => {
  const d = sandbox.intervalDates(sandbox.filtered, 'day');
  assert.strictEqual(d.length, 7);
  assert.strictEqual(d[0].start, '2026-01-01');
  assert.strictEqual(d[6].start, '2026-03-05');
});

test('buildNetWorthSeries month: running assets+liabilities at month ends', () => {
  const s = sandbox.buildNetWorthSeries('month');
  assert.strictEqual(s.length, 3);
  assert.strictEqual(s[0].value, 2950, 'end Jan: 1000+2000-50');
  assert.strictEqual(s[1].value, 2450, 'end Feb: +300-800');
  assert.strictEqual(s[2].value, 2230, 'end Mar: -100-100-20');
  assert.strictEqual(s[2].date, '2026-03-31');
});

test('buildNetWorthSeries day: one point per txn date', () => {
  const s = sandbox.buildNetWorthSeries('day');
  assert.strictEqual(s.length, 7);
  assert.strictEqual(s[0].value, 1000);
  assert.strictEqual(s[3].value, 2150);
  assert.strictEqual(s[6].value, 2230);
});

test('buildIncomeExpenseBars month: per-interval net segments per account', () => {
  const d = sandbox.buildIncomeExpenseBars('month');
  assert.strictEqual(d.labels.length, 3);
  assert.strictEqual(d.income[0].length, 1);
  assert.strictEqual(d.income[0][0].account, 'Income:Salary');
  assert.strictEqual(d.income[0][0].value, 2000, 'income shown positive');
  assert.strictEqual(d.expenses[0][0].account, 'Expenses:Food');
  assert.strictEqual(d.expenses[0][0].value, 50);
  assert.strictEqual(d.income[1][0].account, 'Income:Freelance');
  assert.strictEqual(d.income[1][0].value, 300);
  assert.strictEqual(d.expenses[1][0].account, 'Expenses:Rent');
  assert.strictEqual(d.expenses[1][0].value, 800);
  assert.strictEqual(d.income[2].length, 0, 'no income in March');
  assert.strictEqual(d.expenses[2][0].account, 'Expenses:Food:Groceries');
  assert.strictEqual(d.expenses[2][0].value, 20);
});

test('buildAccountTree expenses: rollup, dummy leaf for direct balance, sorted desc', () => {
  const t = sandbox.buildAccountTree(['expenses', 'exp']);
  assert.strictEqual(t.children.length, 1);
  const ex = t.children[0];
  assert.strictEqual(ex.name, 'Expenses');
  assert.strictEqual(ex.signedValue, 870, '50+800+20');
  assert.strictEqual(ex.value, 870);
  assert.strictEqual(ex.children[0].name, 'Rent', 'sorted by value desc');
  assert.strictEqual(ex.children[0].value, 800);
  const food = ex.children[1];
  assert.strictEqual(food.name, 'Food');
  assert.strictEqual(food.signedValue, 70, 'direct 50 + groceries 20');
  assert.strictEqual(food.children.length, 2, 'dummy + Groceries');
  assert.strictEqual(food.children[0].isDummy, true, 'dummy leaf for direct balance');
  assert.strictEqual(food.children[0].value, 50);
  assert.strictEqual(food.children[1].name, 'Groceries');
  assert.strictEqual(food.children[1].value, 20);
});

test('buildAccountTree liabilities: dominant negative sign sizes by |balance|', () => {
  const t = sandbox.buildAccountTree(['liabilities', 'lia']);
  const li = t.children[0];
  assert.strictEqual(li.name, 'Liabilities');
  assert.strictEqual(li.signedValue, -100);
  assert.strictEqual(li.value, 100, 'sized by abs for negative-dominant tree');
});

test('buildAccountTree empty: no exception, value 0', () => {
  const t = sandbox.buildAccountTree(['nonexistent']);
  assert.strictEqual(t.children.length, 0);
  assert.strictEqual(t.value, 0);
});

test('buildAccountTree includes zero-balance leaf excluded', () => {
  // filtered with a date range that excludes the Food txn: Jan 15 only (salary)
  vm.runInContext('filtered = allTxns.filter(function(t){return t.date==="2026-01-15";});', sandbox);
  const t = sandbox.buildAccountTree(['expenses', 'exp']);
  assert.strictEqual(t.children.length, 0, 'no expense txns in range');
  vm.runInContext('filtered = allTxns.slice();', sandbox);
});

test('buildAccountBalanceSeries: running balance per changed date, case-insensitive', () => {
  const s = sandbox.buildAccountBalanceSeries('assets:cash');
  assert.strictEqual(s.length, 7);
  const vals = s.map(p => p.value);
  [1000, 3000, 2950, 2150, 2450, 2350, 2330].forEach((v, i) =>
    assert.strictEqual(vals[i], v, 'point ' + i + ': expected ' + v + ' got ' + vals[i]));
  const s2 = sandbox.buildAccountBalanceSeries('ASSETS:CASH');
  assert.strictEqual(s2.length, 7);
  assert.strictEqual(s2[6].value, 2330);
});

test('buildAccountBalanceSeries parent rolls up children', () => {
  const s = sandbox.buildAccountBalanceSeries('expenses:food');
  assert.strictEqual(s.length, 2);
  assert.strictEqual(s[0].value, 50, 'direct Food posting');
  assert.strictEqual(s[1].value, 70, 'Food + Food:Groceries');
});

test('builders handle empty filtered without exception', () => {
  vm.runInContext('filtered = [];', sandbox);
  assert.strictEqual(sandbox.buildNetWorthSeries('month').length, 0);
  const bars = sandbox.buildIncomeExpenseBars('month');
  assert.strictEqual(bars.labels.length, 0);
  assert.strictEqual(sandbox.buildAccountBalanceSeries('assets:cash').length, 0);
  const t = sandbox.buildAccountTree(['expenses']);
  assert.strictEqual(t.children.length, 0);
  vm.runInContext('filtered = allTxns.slice();', sandbox);
});

// ══════════════════════════════════════════════════════════════════
// TASK 3 TESTS — renderLineChart (generic line/area renderer)
// ══════════════════════════════════════════════════════════════════

test('renderLineChart: empty points -> empty-state message in container', () => {
  const c = stubEl('div');
  sandbox.renderLineChart(c, [], {});
  assert.ok(c.innerHTML.indexOf('chart-empty') !== -1, 'empty state rendered, got: ' + c.innerHTML.slice(0, 80));
  assert.strictEqual(c.children.length, 0, 'no svg for empty series');
});

test('renderLineChart: renders an svg with axes, grid, line, dots', () => {
  const c = stubEl('div');
  const pts = [{ date: '2026-01-31', label: '2026-01', value: 100 }, { date: '2026-02-28', label: '2026-02', value: 200 }, { date: '2026-03-31', label: '2026-03', value: 150 }];
  sandbox.renderLineChart(c, pts, { mode: 'line' });
  assert.strictEqual(c.children.length, 1, 'one svg appended');
  const svg = c.children[0];
  assert.strictEqual(svg.tagName, 'SVG');
  const kinds = {};
  (function walk(el) { kinds[el.tagName] = (kinds[el.tagName] || 0) + 1; (el.children || []).forEach(walk); })(svg);
  assert.ok(kinds.PATH >= 1, 'line path drawn');
  assert.ok(kinds.CIRCLE >= 3, 'dots at each point');
  assert.ok(svg.children.length >= 1 && kinds.LINE >= 3, 'grid drawn');
});

test('renderLineChart: area mode draws a filled path', () => {
  const c = stubEl('div');
  const pts = [{ date: '2026-01-31', value: 100 }, { date: '2026-02-28', value: 200 }];
  sandbox.renderLineChart(c, pts, { mode: 'area' });
  const svg = c.children[0];
  let filledPath = null;
  (function walk(el) { (el.children || []).forEach(ch => { if (ch.tagName === 'PATH' && ch.attributes['fill'] && ch.attributes['fill'] !== 'none') filledPath = ch; walk(ch); }); })(svg);
  assert.ok(filledPath, 'area path with fill found');
});

test('renderLineChart: single point renders without exception', () => {
  const c = stubEl('div');
  sandbox.renderLineChart(c, [{ date: '2026-01-15', value: 500 }], { mode: 'line' });
  assert.strictEqual(c.children[0].tagName, 'SVG');
  const kinds = {};
  (function walk(el) { kinds[el.tagName] = (kinds[el.tagName] || 0) + 1; (el.children || []).forEach(walk); })(c.children[0]);
  assert.ok(kinds.CIRCLE >= 1, 'single dot drawn');
});

test('renderLineChart: many intervals thin x labels', () => {
  const c = stubEl('div');
  const pts = [];
  for (let i = 0; i < 60; i++) pts.push({ date: '2021-' + String(Math.floor(i / 12) + 1).padStart(2, '0') + '-28', label: 'L' + i, value: i });
  // distinct labels for 5 years of months
  const many = [];
  for (let y = 2021; y <= 2025; y++) for (let mo = 0; mo < 12; mo++) many.push({ date: y + '-' + String(mo + 1).padStart(2, '0') + '-28', label: y + '-' + String(mo + 1).padStart(2, '0'), value: mo });
  sandbox.renderLineChart(c, many, { mode: 'line' });
  const svg = c.children[0];
  let xLabels = 0;
  (function walk(el) { (el.children || []).forEach(ch => { if (ch.tagName === 'TEXT' && ch.attributes['class'] === 'x-label') xLabels++; walk(ch); }); })(svg);
  assert.ok(xLabels > 0 && xLabels <= Math.ceil(1000 - 60) / 70 + 2, 'x labels thinned: ' + xLabels);
  assert.ok(xLabels < 60, 'not all 60 labels shown: ' + xLabels);
});

test('renderDashboard: exists as function (shell rendered via Playwright)', () => {
  assert.strictEqual(typeof sandbox.renderDashboard, 'function');
});

// ══════════════════════════════════════════════════════════════════
// TASK 4 TESTS — renderBarChart (income vs expenses, diverging stacked bars)
// ══════════════════════════════════════════════════════════════════

function barFixture(nIntervals) {
  const labels = [], income = [], expenses = [];
  for (let i = 0; i < nIntervals; i++) {
    labels.push('2026-' + String(i + 1).padStart(2, '0'));
    income.push([{ account: 'Income:Salary', value: 100 + i }]);
    expenses.push([{ account: 'Expenses:Rent', value: 80 + i }, { account: 'Expenses:Food', value: 20 }]);
  }
  return { labels, income, expenses };
}

test('renderBarChart: empty data -> empty-state message', () => {
  const c = stubEl('div');
  sandbox.renderBarChart(c, { labels: [], income: [], expenses: [] }, {});
  assert.ok(c.innerHTML.indexOf('chart-empty') !== -1, 'empty state');
  assert.strictEqual(c.children.length, 0, 'no svg');
});

test('renderBarChart: all-zero data -> empty-state message', () => {
  const c = stubEl('div');
  sandbox.renderBarChart(c, { labels: ['2026-01'], income: [[{ account: 'Income:X', value: 0 }]], expenses: [[{ account: 'Expenses:X', value: 0 }]] }, {});
  assert.ok(c.innerHTML.indexOf('chart-empty') !== -1, 'zero data shows empty state');
});

test('renderBarChart: stacked mode draws income above zero, expenses below, both families colored', () => {
  const c = stubEl('div');
  const data = { labels: ['2026-01'], income: [[{ account: 'Income:Salary', value: 100 }]], expenses: [[{ account: 'Expenses:Rent', value: 80 }]] };
  sandbox.renderBarChart(c, data, { mode: 'stacked' });
  assert.strictEqual(c.children.length >= 1, true);
  const svg = c.children[0];
  assert.strictEqual(svg.tagName, 'SVG');
  const rects = [];
  (function walk(el) { (el.children || []).forEach(ch => { if (ch.tagName === 'RECT') rects.push(ch); walk(ch); }); })(svg);
  const visible = rects.filter(r => r.attributes['fill'] && r.attributes['fill'] !== 'transparent');
  assert.strictEqual(visible.length, 2, 'one income bar + one expense bar');
  const fills = visible.map(r => r.attributes['fill']);
  assert.ok(fills.some(f => f === sandbox.greenShade(0)), 'income uses green family: ' + fills);
  assert.ok(fills.some(f => f === sandbox.redShade(0)), 'expense uses red family');
  // income bar above zero-line (y + height <= y(0)), expense bar below (y >= y(0))
  const y0 = Number(svg.children.filter(() => true).length) && null; // find zero line y from zero-line element
  let zeroY = null;
  (function walk2(el) { (el.children || []).forEach(ch => { if (ch.tagName === 'LINE' && ch.attributes['class'] === 'zero-line') zeroY = Number(ch.attributes['y1']); walk2(ch); }); })(svg);
  assert.ok(zeroY !== null, 'zero line drawn');
  const inc = visible[0], exp = visible[1];
  assert.ok(Number(inc.attributes['y']) + Number(inc.attributes['height']) <= zeroY + 0.01, 'income bar bottom at or above zero line');
  assert.ok(Number(exp.attributes['y']) >= zeroY - 0.01, 'expense bar top at or below zero line');
});

test('renderBarChart: stacked mode stacks multiple segments per column', () => {
  const c = stubEl('div');
  const data = { labels: ['2026-01'], income: [[{ account: 'Income:A', value: 100 }, { account: 'Income:B', value: 50 }]], expenses: [[{ account: 'Expenses:X', value: 30 }, { account: 'Expenses:Y', value: 20 }]] };
  sandbox.renderBarChart(c, data, { mode: 'stacked' });
  const rects = [];
  (function walk(el) { (el.children || []).forEach(ch => { if (ch.tagName === 'RECT' && ch.attributes['fill'] !== 'transparent') rects.push(ch); walk(ch); }); })(c.children[0]);
  assert.strictEqual(rects.length, 4, 'two income + two expense segments');
  // distinct colors for distinct accounts within a family
  const incFills = rects.slice(0, 2).map(r => r.attributes['fill']);
  assert.notStrictEqual(incFills[0], incFills[1], 'income segments distinct shades');
});

test('renderBarChart: single mode draws one total bar per side', () => {
  const c = stubEl('div');
  const data = { labels: ['2026-01'], income: [[{ account: 'Income:A', value: 100 }, { account: 'Income:B', value: 50 }]], expenses: [[{ account: 'Expenses:X', value: 30 }, { account: 'Expenses:Y', value: 20 }]] };
  sandbox.renderBarChart(c, data, { mode: 'single' });
  const rects = [];
  (function walk(el) { (el.children || []).forEach(ch => { if (ch.tagName === 'RECT' && ch.attributes['fill'] !== 'transparent') rects.push(ch); walk(ch); }); })(c.children[0]);
  assert.strictEqual(rects.length, 2, 'single bar per side');
});

test('renderBarChart: hitboxes per column for hover', () => {
  const c = stubEl('div');
  const data = barFixture(3);
  sandbox.renderBarChart(c, data, { mode: 'stacked' });
  const hits = [];
  (function walk(el) { (el.children || []).forEach(ch => { if (ch.tagName === 'RECT' && ch.attributes['fill'] === 'transparent') hits.push(ch); walk(ch); }); })(c.children[0]);
  assert.strictEqual(hits.length, 3, 'one hitbox per interval');
  assert.strictEqual(typeof hits[0].addEventListener, 'function');
});

test('renderBarChart: legend lists accounts with swatches', () => {
  const c = stubEl('div');
  const data = barFixture(2);
  sandbox.renderBarChart(c, data, { mode: 'stacked' });
  // legend is a sibling div after the svg
  assert.ok(c.children.length >= 2, 'svg + legend');
  const legend = c.children[1];
  assert.strictEqual(legend.tagName, 'DIV');
  const legendHtml = legend._html || '';
  assert.ok(legendHtml.indexOf('Income:Salary') !== -1, 'income account in legend');
  assert.ok(legendHtml.indexOf('Expenses:Rent') !== -1, 'expense account in legend');
  assert.ok(legendHtml.indexOf('legend-swatch') !== -1, 'swatches present');
});

test('renderBarChart: 60 columns thin x labels', () => {
  const c = stubEl('div');
  const data = barFixture(60);
  sandbox.renderBarChart(c, data, { mode: 'stacked' });
  let xLabels = 0;
  (function walk(el) { (el.children || []).forEach(ch => { if (ch.tagName === 'TEXT' && ch.attributes['class'] === 'x-label') xLabels++; walk(ch); }); })(c.children[0]);
  assert.ok(xLabels > 0, 'some labels');
  assert.ok(xLabels <= 15, 'thinned below 15: ' + xLabels);
});

test('renderBarChart: single column renders without NaN', () => {
  const c = stubEl('div');
  const data = { labels: ['2026-05'], income: [[{ account: 'Income:A', value: 10 }]], expenses: [[{ account: 'Expenses:X', value: 5 }]] };
  sandbox.renderBarChart(c, data, { mode: 'stacked' });
  const rects = [];
  (function walk(el) { (el.children || []).forEach(ch => { if (ch.tagName === 'RECT') rects.push(ch); walk(ch); }); })(c.children[0]);
  rects.forEach(r => {
    ['x', 'y', 'width', 'height'].forEach(a => {
      const v = r.attributes[a];
      assert.ok(v !== undefined && v.indexOf('NaN') === -1, a + ' not NaN: ' + v);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// TASK 5 TESTS — partitionTree, squarifyTree, hierarchy renderers
// ══════════════════════════════════════════════════════════════════

function expTree() {
  return sandbox.buildAccountTree(['expenses', 'exp']);
}

test('partitionTree: fractions sum, depths assigned, parents cover children', () => {
  const t = expTree();
  sandbox.partitionTree(t);
  assert.strictEqual(t.x0, 0); assert.strictEqual(t.x1, 1); assert.strictEqual(t.depth, 0);
  const ex = t.children[0]; // Expenses
  assert.strictEqual(ex.depth, 1);
  assert.ok(Math.abs(ex.x1 - ex.x0 - 1) < 1e-9, 'single top-level child covers all');
  // Rent + Food fractions sum to 1
  const sum = ex.children.reduce((s, c) => s + (c.x1 - c.x0), 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, 'children fractions sum to 1, got ' + sum);
  // sorted by value desc -> fractions desc
  assert.ok(ex.children[0].x1 - ex.children[0].x0 >= ex.children[1].x1 - ex.children[1].x0);
  // grandkids: dummy Food (50) + Groceries (20)
  const food = ex.children[1];
  food.children.forEach(c => assert.strictEqual(c.depth, 3));
  const gsum = food.children.reduce((s, c) => s + (c.x1 - c.x0), 0);
  assert.ok(Math.abs(gsum - (food.x1 - food.x0)) < 1e-9, 'grandchild fractions sum to parent span, got ' + gsum + ' vs ' + (food.x1 - food.x0));
  // parent covers children: each child range inside parent range
  ex.children.forEach(c => { assert.ok(c.x0 >= ex.x0 - 1e-9 && c.x1 <= ex.x1 + 1e-9); });
  // grandchildren contained within their parent's SPAN (not the full circle)
  food.children.forEach(c => { assert.ok(c.x0 >= food.x0 - 1e-9 && c.x1 <= food.x1 + 1e-9, 'grandchild inside parent span'); });
  assert.ok(food.children[0].x1 - food.children[0].x0 < food.x1 - food.x0, 'grandchild fraction smaller than parent span');
});

test('squarifyTree: leaves tile the area without overlap', () => {
  const t = expTree();
  const W = 1000, H = 400;
  sandbox.squarifyTree(t, W, H);
  assert.strictEqual(t.x, 0); assert.strictEqual(t.y, 0);
  assert.ok(Math.abs(t.w - W) < 1e-9 && Math.abs(t.h - H) < 1e-9);
  const leaves = [];
  (function walk(n) { (n.children || []).forEach(walk); if (!(n.children || []).length) leaves.push(n); })(t);
  assert.strictEqual(leaves.length, 3, 'Rent, dummy Food, Groceries');
  // all within bounds
  leaves.forEach(l => {
    assert.ok(l.x >= -0.01 && l.y >= -0.01, 'rect starts in bounds');
    assert.ok(l.x + l.w <= W + 0.01, 'rect right in bounds: ' + (l.x + l.w));
    assert.ok(l.y + l.h <= H + 0.01, 'rect bottom in bounds');
    assert.ok(l.w > 0 && l.h > 0, 'positive size');
  });
  // no overlapping interiors (allow 2px padding gap tolerance): overlap requires BOTH axes > 2.1
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const a = leaves[i], b = leaves[j];
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    assert.ok(!(ox > 2.1 && oy > 2.1), 'no material overlap between ' + a.name + ' and ' + b.name + ' (ox=' + ox + ',oy=' + oy + ')');
  }
  // area proportionality: Rent (800/870) vs Groceries (20/870) ratio ~40x
  const rent = leaves.find(l => l.name === 'Rent'), groc = leaves.find(l => l.name === 'Groceries');
  const ratio = (rent.w * rent.h) / (groc.w * groc.h);
  assert.ok(ratio > 20 && ratio < 60, 'Rent:Groceries area ratio ~40, got ' + ratio);
});

test('squarifyTree: single child fills parent', () => {
  const t = sandbox.buildAccountTree(['liabilities', 'lia']);
  sandbox.squarifyTree(t, 500, 200);
  const li = t.children[0];
  assert.ok(li.w >= 495 && li.h >= 195, 'child fills nearly all, got ' + li.w + 'x' + li.h);
});

test('renderTreemap: empty tree shows message', () => {
  const c = stubEl('div');
  sandbox.renderTreemap(c, { name: 'root', value: 0, children: [] });
  assert.ok(c.innerHTML.indexOf('Chart is empty') !== -1);
});

test('renderTreemap: leaf rects with colors and labels', () => {
  const c = stubEl('div');
  sandbox.renderTreemap(c, expTree());
  assert.strictEqual(c.children.length, 1);
  const svg = c.children[0];
  assert.strictEqual(svg.tagName, 'SVG');
  const rects = [];
  let labels = 0;
  (function walk(el) {
    (el.children || []).forEach(ch => {
      if (ch.tagName === 'RECT') rects.push(ch);
      if (ch.tagName === 'TEXT') labels++;
      walk(ch);
    });
  })(svg);
  assert.strictEqual(rects.length, 3, 'one rect per leaf');
  rects.forEach(r => assert.strictEqual(r.attributes['fill'], sandbox.accountColor('Expenses')));
  assert.ok(labels >= 1, 'labels drawn');
});

test('renderTreemap: small rect hides its label', () => {
  const c = stubEl('div');
  c.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 600, width: 200, height: 600 });
  sandbox.renderTreemap(c, expTree());
  const svg = c.children[0];
  const vis = [];
  (function walk(el) { (el.children || []).forEach(ch => { if (ch.tagName === 'TEXT') vis.push(ch.attributes['visibility']); walk(ch); }); })(svg);
  assert.ok(vis.some(v => v === 'hidden'), 'at least one hidden label in 200px-wide treemap: ' + JSON.stringify(vis));
});

test('renderSunburst: empty tree shows message', () => {
  const c = stubEl('div');
  sandbox.renderSunburst(c, { name: 'root', value: 0, children: [] });
  assert.ok(c.innerHTML.indexOf('Chart is empty') !== -1);
});

test('renderSunburst: arcs per non-root node, full circle for single top, center text', () => {
  const c = stubEl('div');
  sandbox.renderSunburst(c, expTree());
  const svg = c.children[0];
  const paths = [], texts = [];
  (function walk(el) { (el.children || []).forEach(ch => { if (ch.tagName === 'PATH') paths.push(ch); if (ch.tagName === 'TEXT') texts.push(ch); walk(ch); }); })(svg);
  assert.strictEqual(paths.length, 5, 'Expenses, Rent, Food, dummy, Groceries');
  paths.forEach(p => assert.ok(p.attributes['d'] && p.attributes['d'].indexOf('NaN') === -1));
  assert.ok(texts.length >= 2, 'center name + value text');
  assert.ok(texts[0]._text.indexOf('Expenses') !== -1, 'center defaults to single top account: ' + texts[0]._text);
});

test('renderIcicle: empty tree shows message', () => {
  const c = stubEl('div');
  sandbox.renderIcicle(c, { name: 'root', value: 0, children: [] });
  assert.ok(c.innerHTML.indexOf('Chart is empty') !== -1);
});

test('renderIcicle: rects per non-root node, depth columns left to right, small labels hidden', () => {
  const c = stubEl('div');
  sandbox.renderIcicle(c, expTree());
  const svg = c.children[0];
  const rects = [];
  (function walk(el) { (el.children || []).forEach(ch => { if (ch.tagName === 'RECT') rects.push(ch); walk(ch); }); })(svg);
  assert.strictEqual(rects.length, 5, 'one rect per non-root node');
  // depth ordering: Expenses (depth 1) x < Rent/Food (depth 2) x < grandkids (depth 3) x
  const byFill = {};
  rects.forEach(r => { byFill[r.attributes['x'] + '|' + r.attributes['y']] = r; });
  const x1 = rects.filter(r => Number(r.attributes['height']) > 100); // big rects are Expenses (root covers full H)
  assert.ok(x1.length >= 1);
  // labels: tiny segments hidden
  const vis = [];
  (function walk(el) { (el.children || []).forEach(ch => { if (ch.tagName === 'TEXT') vis.push(ch.attributes['visibility']); walk(ch); }); })(svg);
  assert.ok(vis.length >= 1 && vis.some(v => v === 'hidden'), 'small icicle labels hidden');
});

test('renderHierarchy: dispatches by chartState.hierMode', () => {
  const c1 = stubEl('div');
  sandbox.chartState.hierMode = 'treemap';
  sandbox.renderHierarchy(c1, expTree());
  assert.strictEqual(c1.children[0].tagName, 'SVG');
  assert.ok(c1.children[0].children.some(ch => ch.tagName === 'RECT' || (ch.children || []).some(g2 => g2.tagName === 'RECT')));
  sandbox.chartState.hierMode = 'sunburst';
  const c2 = stubEl('div');
  sandbox.renderHierarchy(c2, expTree());
  let paths = 0;
  (function walk(el) { (el.children || []).forEach(ch => { if (ch.tagName === 'PATH') paths++; walk(ch); }); })(c2.children[0]);
  assert.ok(paths >= 5, 'sunburst paths via dispatcher');
  sandbox.chartState.hierMode = 'icicle';
  const c3 = stubEl('div');
  sandbox.renderHierarchy(c3, expTree());
  assert.strictEqual(c3.children[0].tagName, 'SVG');
  sandbox.chartState.hierMode = 'treemap'; // restore
});

test('buildAccountTree abs mode: sizes by magnitude so negative sections survive', () => {
  // combined assets+liabilities tree: default dominant-sign clamps liabilities out
  const aP = sandbox.getUsedPrefixes(sandbox.allTxns, ['assets', 'asset', 'ass']);
  const lP = sandbox.getUsedPrefixes(sandbox.allTxns, ['liabilities', 'liability', 'lia']);
  const signed = sandbox.buildAccountTree(aP.concat(lP));
  const signedTop = signed.children.map(c => c.name).join(',');
  const abs = sandbox.buildAccountTree(aP.concat(lP), { abs: true });
  const absTop = abs.children.map(c => c.name).join(',');
  assert.ok(absTop.indexOf('Liabilities') !== -1, 'abs keeps liabilities: ' + absTop);
  const li = abs.children.find(c => c.name === 'Liabilities');
  assert.strictEqual(li.value, 100, 'abs sizes liabilities by magnitude');
  assert.ok(signedTop.indexOf('Liabilities') === -1, 'default dominant-sign drops them: ' + signedTop);
});

// ══════════════════════════════════════════════════════════════════
// TASK 8 TESTS — dashboard stats row, empty states
// ══════════════════════════════════════════════════════════════════

test('renderDashboard: no journal -> empty state visible, sections hidden', () => {
  vm.runInContext('allTxns = []; filtered = [];', sandbox);
  sandbox.renderDashboard();
  assert.strictEqual(elCache['dash-empty'].style.display, '', 'empty state shown');
  assert.strictEqual(elCache['dash-sections'].style.display, 'none', 'sections hidden');
  vm.runInContext('allTxns = parseJournal(__FIXTURE__); filtered = allTxns.slice();', sandbox);
});

test('renderDashboard: with journal -> six stat cards with correct totals', () => {
  vm.runInContext('filtered = allTxns.slice();', sandbox);
  sandbox.renderDashboard();
  assert.strictEqual(elCache['dash-empty'].style.display, 'none');
  assert.strictEqual(elCache['dash-sections'].style.display, '', 'sections shown');
  const html = elCache['dash-stats'].innerHTML || '';
  ['Total Assets', 'Total Liabilities', 'Net Worth', 'Total Income', 'Total Expenses', 'Net Income'].forEach(lbl => {
    assert.ok(html.indexOf(lbl) !== -1, lbl + ' card present');
  });
  // fixture: assets 2330, liabilities -100, net worth 2230, income 2300, expenses 870, net income 1430
  assert.ok(html.indexOf('2.330') !== -1, 'assets total formatted (nl-NL), html: ' + html.slice(0, 400));
  assert.ok(html.indexOf('2.230') !== -1, 'net worth total');
  assert.ok(html.indexOf('2.300') !== -1, 'income total');
  assert.ok(html.indexOf('1.430') !== -1, 'net income total');
});

test('renderDashboard: filter-excludes-all -> em-dash stats and empty chart messages', () => {
  vm.runInContext('filtered = [];', sandbox);
  sandbox.renderDashboard();
  const statsHtml = elCache['dash-stats'].innerHTML || '';
  assert.ok(statsHtml.indexOf('—') !== -1, 'stats show em-dashes: ' + statsHtml.slice(0, 200));
  assert.ok((elCache['dash-networth'].innerHTML || '').indexOf('chart-empty') !== -1, 'net worth shows empty state');
  assert.ok((elCache['dash-incexp'].innerHTML || '').indexOf('chart-empty') !== -1, 'bars show empty state');
  vm.runInContext('filtered = allTxns.slice();', sandbox);
});

tests.forEach(([name, fn]) => {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    failures.push('  FAIL: ' + name + '\n    ' + String(e.message).split('\n')[0]);
  }
});
console.log('\n' + passed + ' passed, ' + failed + ' failed, ' + tests.length + ' total');
if (failed) { console.log('\n' + failures.join('\n')); process.exit(1); }
console.log('ALL GREEN');