#!/usr/bin/env node
// Dev-only: regenerates tests/oracle/multicurrency.json from real hledger.
// Run: node tests/gen-oracle.js   (needs hledger on PATH; tests themselves do not)
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const fx = n => path.join(__dirname, 'fixtures', n);
const ENDS = ['2025-09-01', '2025-12-01', '2026-01-01'];      // exclusive -e dates
const CURS = ['€', '$', '£'];                                  // -X targets
const RAW = ['€', '$', '£', 'BTC', 'XDWD', 'XEON'];            // expanded views
const SETS = {
  multicurrency: ['multicurrency.journal'],
  'multicurrency+prices': ['multicurrency.journal', 'multicurrency-prices.journal'],
};
const dayBefore = d => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); };
const reEsc = c => c.replace(/[$.*+?^()[\]{}|\\]/g, '\\$&');
const hl = args => execFileSync('hledger', args, { encoding: 'utf8' });
const num = s => { const neg = /-/.test(s); const n = parseFloat(s.replace(/[^0-9.]/g, '')); return neg ? -n : n; };
function bal(files, extra) {
  const a = []; files.forEach(f => a.push('-f', fx(f)));
  const out = hl([...a, 'bal', '--flat', '-N', '-O', 'csv', ...extra]);
  const res = {};
  out.trim().split('\n').slice(1).forEach(line => {
    const m = line.match(/^"([^"]+)","(.*)"$/);
    if (m) res[m[1]] = num(m[2]);
  });
  return res;
}
function prices(files) {
  const a = []; files.forEach(f => a.push('-f', fx(f)));
  return hl([...a, 'prices', '--infer-market-prices']).trim().split('\n').map(l => {
    const m = l.match(/^P (\S+) (\S+) (.+)$/);
    return m ? { date: m[1], from: m[2], to: m[3].replace(/[-0-9.,\s]/g, ''), rate: Math.abs(num(m[3])) } : null;
  }).filter(Boolean);
}
const out = { hledger: hl(['--version']).trim(), sets: {} };
Object.keys(SETS).forEach(k => {
  const files = SETS[k], s = { files, valued: {}, raw: {}, prices: prices(files) };
  ENDS.forEach(e => {
    CURS.forEach(c => { s.valued[c + '|' + dayBefore(e)] = bal(files, ['-X', c, '--infer-market-prices', '-e', e]); });
    RAW.forEach(c => { s.raw[c + '|' + dayBefore(e)] = bal(files, ['cur:^' + reEsc(c) + '$', '-e', e]); });
  });
  out.sets[k] = s;
});
fs.writeFileSync(path.join(__dirname, 'oracle', 'multicurrency.json'), JSON.stringify(out, null, 1) + '\n');
console.log('wrote tests/oracle/multicurrency.json (' + out.hledger + ')');
