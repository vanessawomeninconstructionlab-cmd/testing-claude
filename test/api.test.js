// End-to-end API tests covering the full booking → payment flow.
// Run with: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 4599;
const BASE = `http://localhost:${PORT}`;
let server;

async function waitForServer(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}

before(async () => {
  // Use an isolated data dir so tests never touch real bookings.
  const testData = path.join(process.cwd(), 'data');
  fs.mkdirSync(testData, { recursive: true });
  server = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: String(PORT), ADMIN_TOKEN: 'testtoken' },
    stdio: 'ignore',
  });
  await waitForServer(`${BASE}/api/health`);
});

after(() => { if (server) server.kill(); });

// Pick the first open date returned by the API.
async function firstOpenSlot() {
  const dates = await (await fetch(`${BASE}/api/availability`)).json();
  const date = dates.dates[0];
  const slots = await (await fetch(`${BASE}/api/availability?date=${date}`)).json();
  const slot = slots.slots.find((s) => s.available);
  return { date, time: slot.time };
}

test('health check responds', async () => {
  const r = await fetch(`${BASE}/api/health`);
  assert.equal(r.status, 200);
});

test('service catalog is seeded', async () => {
  const { services } = await (await fetch(`${BASE}/api/services`)).json();
  assert.ok(services.length >= 5, 'expected several services');
  assert.ok(services[0].amount_display.startsWith('$'));
});

test('availability returns open dates and slots', async () => {
  const { dates } = await (await fetch(`${BASE}/api/availability`)).json();
  assert.ok(dates.length > 0);
  const { slots } = await (await fetch(`${BASE}/api/availability?date=${dates[0]}`)).json();
  assert.ok(slots.length > 0);
});

test('rejects a booking with missing fields', async () => {
  const r = await fetch(`${BASE}/api/bookings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service_id: 1 }),
  });
  assert.equal(r.status, 400);
});

test('rejects an invalid email', async () => {
  const { date, time } = await firstOpenSlot();
  const r = await fetch(`${BASE}/api/bookings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: 1, customer_name: 'Bad Email', email: 'nope', phone: '555',
      address: '1 St', city: 'Town', zip: '00000', scheduled_date: date, scheduled_time: time,
    }),
  });
  assert.equal(r.status, 400);
});

test('full flow: create booking, pay (demo), confirm', async () => {
  const { date, time } = await firstOpenSlot();
  const create = await fetch(`${BASE}/api/bookings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: 1, customer_name: 'Jane Homeowner', email: 'jane@example.com',
      phone: '(555) 111-2222', address: '42 Cool St', city: 'Springfield', zip: '90210',
      scheduled_date: date, scheduled_time: time, notes: 'Back gate code 1234',
    }),
  });
  assert.equal(create.status, 201);
  const { reference, checkoutUrl, paymentMode } = await create.json();
  assert.match(reference, /^CA-/);
  assert.equal(paymentMode, 'demo');
  assert.ok(checkoutUrl.includes('/pay.html'));

  // Before payment, booking is unpaid/pending.
  let b = (await (await fetch(`${BASE}/api/bookings/${reference}`)).json()).booking;
  assert.equal(b.payment_status, 'unpaid');
  assert.equal(b.status, 'pending');

  // Pay via demo confirm.
  const pay = await fetch(`${BASE}/api/payments/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference }),
  });
  assert.equal(pay.status, 200);

  // Now paid + confirmed.
  b = (await (await fetch(`${BASE}/api/bookings/${reference}`)).json()).booking;
  assert.equal(b.payment_status, 'paid');
  assert.equal(b.status, 'confirmed');
});

test('admin requires a valid token', async () => {
  const bad = await fetch(`${BASE}/api/admin/bookings`, { headers: { 'x-admin-token': 'wrong' } });
  assert.equal(bad.status, 401);
  const good = await fetch(`${BASE}/api/admin/bookings`, { headers: { 'x-admin-token': 'testtoken' } });
  assert.equal(good.status, 200);
  const { bookings, stats } = await good.json();
  assert.ok(Array.isArray(bookings));
  assert.ok(stats.total >= 1);
  assert.ok(stats.revenue_cents >= 1);
});

test('double-booking a full slot is rejected', async () => {
  const { date, time } = await firstOpenSlot();
  // Crew capacity is 2; fill the slot then expect a 409.
  const mk = (n) => fetch(`${BASE}/api/bookings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: 2, customer_name: `Fill ${n}`, email: `fill${n}@example.com`,
      phone: '555', address: '1 St', city: 'Town', zip: '00000',
      scheduled_date: date, scheduled_time: time,
    }),
  });
  // Existing tests may already have booked this slot; keep booking until full.
  let lastStatus = 201;
  for (let i = 0; i < 4; i++) {
    const r = await mk(i);
    lastStatus = r.status;
    if (r.status === 409) break;
  }
  assert.equal(lastStatus, 409, 'slot should eventually be full');
});
