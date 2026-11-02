const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const html = readFileSync(`${__dirname}/../index.html`, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function day(date, count = 24, price = 0.5) {
  const start = Date.parse(date);
  return Array.from({ length: count }, (_, i) => ({
    time_start: new Date(start + i * 3600000).toISOString(),
    time_end: new Date(start + (i + 1) * 3600000).toISOString(),
    DKK_per_kWh: price
  }));
}

function dashboard(now = '2026-11-02T12:05:00Z') {
  const nodes = {};
  const charts = [];
  const requests = [];
  const errors = [];
  let interval;
  const context = vm.createContext({
    Intl,
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [now])); }
    },
    document: {
      getElementById(id) {
        return nodes[id] ??= { textContent: '', innerHTML: '', getContext: () => ({}) };
      }
    },
    Chart: class {
      constructor(ctx, config) { this.config = config; charts.push(this); }
      destroy() { this.destroyed = true; }
    },
    console: { error: (...args) => errors.push(args) },
    setInterval(fn, ms) { interval = ms; },
    fetch: async url => {
      requests.push(url);
      return context.response(url);
    }
  });
  context.response = () => { throw new Error('Offline'); };
  vm.runInContext(script.replace(/\nloadPrices\(\);\n/, '\n'), context);
  return {
    nodes, charts, requests, errors, context,
    interval: () => interval,
    load: () => vm.runInContext('loadPrices()', context)
  };
}

function respond(dash, today, tomorrow, status = 200) {
  dash.context.response = url => {
    const next = url.includes('/11-03_');
    return {
      ok: !next || status === 200,
      status: next ? status : 200,
      json: async () => next ? tomorrow : today
    };
  };
}

test('shows both complete days, highlights only now and draws today minimum across chart', async () => {
  const dash = dashboard();
  respond(dash, day('2026-11-02T00:00:00+01:00'), day('2026-11-03T00:00:00+01:00', 24, 0));
  await dash.load();
  const config = dash.charts[0].config;
  assert.equal(config.data.labels.length, 48);
  assert.equal(config.data.labels[0], '02/11 00.00');
  assert.equal(config.data.labels[24], '03/11 00.00');
  assert.equal(config.data.datasets[0].backgroundColor.filter(c => c === '#1a4e8a').length, 1);
  assert.equal(config.data.datasets[0].backgroundColor[13], '#1a4e8a');
  assert.match(dash.nodes.metricCards.innerHTML, /86\.0 øre/);
  assert.match(dash.nodes.pricePeriod.textContent, /2026-11-02 – 2026-11-03/);
  assert.equal(dash.interval(), 300000);
  const calls = [];
  const ctx = new Proxy({}, { get: (_, method) => (...args) => calls.push([method, ...args]) });
  config.plugins[0].afterDatasetsDraw({
    ctx, chartArea: { left: 10, right: 900, top: 0, bottom: 200 },
    scales: { y: { getPixelForValue(value) { assert.equal(value, 85.99); return 120; } } }
  });
  assert.ok(calls.some(c => c[0] === 'moveTo' && c[1] === 10 && c[2] === 120));
  assert.ok(calls.some(c => c[0] === 'lineTo' && c[1] === 900 && c[2] === 120));
});

test('tomorrow 404 is expected; other tomorrow failures are visible while today stays available', async () => {
  const dash = dashboard();
  respond(dash, day('2026-11-02T00:00:00+01:00'), [], 404);
  await dash.load();
  assert.equal(dash.charts[0].config.data.labels.length, 24);
  assert.match(dash.nodes.pricePeriod.textContent, /endnu ikke tilgængelige/);
  assert.match(dash.nodes.statusTxt.textContent, /Live/);
  respond(dash, day('2026-11-02T00:00:00+01:00'), [], 503);
  await dash.load();
  assert.match(dash.nodes.statusTxt.textContent, /Fejl.*morgendagens/);
  assert.equal(dash.errors.length, 1);
  assert.equal(dash.charts[1].config.data.labels.length, 24);
});

test('failed or invalid current prices never invent data and preserve the last chart', async () => {
  const dash = dashboard();
  await dash.load();
  assert.equal(dash.charts.length, 0);
  assert.match(dash.nodes.statusTxt.textContent, /Kunne ikke hente/);
  respond(dash, day('2026-11-02T00:00:00+01:00'), [], 404);
  await dash.load();
  respond(dash, [{ DKK_per_kWh: null }], [], 404);
  await dash.load();
  assert.equal(dash.charts.length, 1);
  assert.equal(dash.charts[0].destroyed, undefined);
  assert.match(dash.nodes.statusTxt.textContent, /senest hentede/);
});

test('uses Copenhagen dates near midnight, including year rollover', async () => {
  const dash = dashboard('2026-12-31T23:15:00Z');
  dash.context.response = url => ({
    ok: true, status: 200,
    json: async () => day(url.includes('01-01') ? '2027-01-01T00:00:00+01:00' : '2027-01-02T00:00:00+01:00')
  });
  await dash.load();
  assert.ok(dash.requests[0].endsWith('/2027/01-01_DK1.json'));
  assert.ok(dash.requests[1].endsWith('/2027/01-02_DK1.json'));
  assert.equal(dash.charts[0].config.data.datasets[0].backgroundColor[0], '#1a4e8a');
});

test('keeps DST repeated intervals and handles quarter-hour current prices', async () => {
  const dash = dashboard('2026-10-25T01:20:00Z');
  const records = day('2026-10-25T00:00:00+02:00', 25);
  dash.context.response = url => ({
    ok: url.includes('10-25'), status: url.includes('10-25') ? 200 : 404,
    json: async () => records
  });
  await dash.load();
  assert.equal(dash.charts[0].config.data.labels.length, 25);
  assert.equal(dash.charts[0].config.data.datasets[0].backgroundColor[3], '#1a4e8a');
  assert.equal(dash.charts[0].config.data.labels.filter(l => l.endsWith('02.00')).length, 2);

  const quarters = dashboard('2026-11-02T12:20:00Z');
  const data = Array.from({ length: 96 }, (_, i) => ({
    time_start: new Date(Date.parse('2026-11-01T23:00:00Z') + i * 900000).toISOString(),
    time_end: new Date(Date.parse('2026-11-01T23:00:00Z') + (i + 1) * 900000).toISOString(),
    DKK_per_kWh: i === 53 ? 0 : 0.5
  }));
  respond(quarters, data.reverse(), [], 404);
  await quarters.load();
  const config = quarters.charts[0].config;
  assert.equal(config.data.labels.length, 96);
  assert.equal(config.data.datasets[0].backgroundColor[53], '#1a4e8a');
  assert.match(quarters.nodes.metricCards.innerHTML, /13.15–13.30/);
});

test('each day gets its own seasonal tariff', async () => {
  const dash = dashboard('2026-09-30T12:00:00Z');
  dash.context.response = url => ({
    ok: true, status: 200,
    json: async () => day(url.includes('09-30') ? '2026-09-30T00:00:00+02:00' : '2026-10-01T00:00:00+02:00')
  });
  await dash.load();
  const tariff = dash.charts[0].config.data.datasets[1].data;
  assert.equal(tariff[17], 42.83);
  assert.equal(tariff[24 + 17], 98);
});
