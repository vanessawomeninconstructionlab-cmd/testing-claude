// REST API for the HVAC booking app.
import express from 'express';
import crypto from 'node:crypto';
import { db } from './db.js';
import { config } from './config.js';
import { openDates, slotsForDate, isSlotBookable } from './availability.js';
import { createCheckout, verifyStripeSession, paymentMode } from './payments.js';

export const api = express.Router();

// ---- Prepared statements ---------------------------------------------------
const listServices = db.prepare('SELECT * FROM services WHERE active = 1 ORDER BY category, name');
const getServiceById = db.prepare('SELECT * FROM services WHERE id = ? AND active = 1');
const insertBooking = db.prepare(`
  INSERT INTO bookings
    (reference, service_id, customer_name, email, phone, address, city, zip, notes,
     scheduled_date, scheduled_time, amount_cents, status, payment_status)
  VALUES
    (@reference, @service_id, @customer_name, @email, @phone, @address, @city, @zip, @notes,
     @scheduled_date, @scheduled_time, @amount_cents, 'pending', 'unpaid')
`);
const getBookingByRef = db.prepare('SELECT * FROM bookings WHERE reference = ?');
const markPaid = db.prepare(`
  UPDATE bookings
  SET payment_status = 'paid', status = 'confirmed', payment_provider = ?, payment_ref = ?
  WHERE reference = ?
`);

// ---- Helpers ---------------------------------------------------------------
function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function publicBooking(row) {
  const service = getServiceById.get(row.service_id) || db.prepare('SELECT * FROM services WHERE id = ?').get(row.service_id);
  return {
    reference: row.reference,
    service: service ? { name: service.name, icon: service.icon, category: service.category } : null,
    customer_name: row.customer_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    city: row.city,
    zip: row.zip,
    notes: row.notes,
    scheduled_date: row.scheduled_date,
    scheduled_time: row.scheduled_time,
    amount_cents: row.amount_cents,
    amount_display: money(row.amount_cents),
    status: row.status,
    payment_status: row.payment_status,
    created_at: row.created_at,
  };
}

function makeReference() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) code += chars[bytes[i] % chars.length];
  return `CA-${code}`;
}

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// ---- Catalog & availability ------------------------------------------------
api.get('/services', (_req, res) => {
  const rows = listServices.all().map((s) => ({ ...s, amount_display: money(s.price_cents) }));
  res.json({ services: rows, paymentMode });
});

api.get('/availability', (req, res) => {
  const { date } = req.query;
  if (date) {
    return res.json({ date, slots: slotsForDate(String(date)) });
  }
  res.json({ dates: openDates() });
});

// ---- Create a booking + start payment --------------------------------------
api.post('/bookings', async (req, res) => {
  try {
    const b = req.body || {};
    const required = ['service_id', 'customer_name', 'email', 'phone', 'address', 'city', 'zip', 'scheduled_date', 'scheduled_time'];
    for (const field of required) {
      if (!b[field] || String(b[field]).trim() === '') {
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
    }
    if (!isEmail(String(b.email))) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    const service = getServiceById.get(Number(b.service_id));
    if (!service) return res.status(400).json({ error: 'Selected service is not available.' });

    if (!isSlotBookable(String(b.scheduled_date), String(b.scheduled_time))) {
      return res.status(409).json({ error: 'That time slot is no longer available. Please pick another.' });
    }

    const reference = makeReference();
    const record = {
      reference,
      service_id: service.id,
      customer_name: String(b.customer_name).trim().slice(0, 120),
      email: String(b.email).trim().slice(0, 160),
      phone: String(b.phone).trim().slice(0, 40),
      address: String(b.address).trim().slice(0, 200),
      city: String(b.city).trim().slice(0, 80),
      zip: String(b.zip).trim().slice(0, 20),
      notes: String(b.notes || '').trim().slice(0, 1000),
      scheduled_date: String(b.scheduled_date),
      scheduled_time: String(b.scheduled_time),
      amount_cents: service.price_cents,
    };

    insertBooking.run(record);
    const booking = getBookingByRef.get(reference);
    const checkout = await createCheckout(booking, service);

    res.status(201).json({
      reference,
      checkoutUrl: checkout.url,
      paymentMode,
      amount_display: money(booking.amount_cents),
    });
  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ error: 'Something went wrong creating your booking. Please try again.' });
  }
});

// ---- Fetch a booking (confirmation / receipt) ------------------------------
api.get('/bookings/:reference', (req, res) => {
  const row = getBookingByRef.get(String(req.params.reference));
  if (!row) return res.status(404).json({ error: 'Booking not found.' });
  res.json({ booking: publicBooking(row) });
});

// ---- Payment confirmation --------------------------------------------------
// Stripe success redirect lands here (GET). Demo flow posts here (POST).
api.get('/payments/confirm', async (req, res) => {
  const reference = String(req.query.reference || '');
  const row = getBookingByRef.get(reference);
  if (!row) return res.redirect('/?error=notfound');

  if (row.payment_status === 'paid') {
    return res.redirect(`/confirmation.html?reference=${reference}`);
  }

  if (req.query.provider === 'stripe') {
    const ok = await verifyStripeSession(String(req.query.session_id || ''));
    if (!ok) return res.redirect(`/?canceled=${reference}`);
    markPaid.run('stripe', String(req.query.session_id || ''), reference);
  }
  res.redirect(`/confirmation.html?reference=${reference}`);
});

api.post('/payments/confirm', (req, res) => {
  const reference = String((req.body && req.body.reference) || '');
  const row = getBookingByRef.get(reference);
  if (!row) return res.status(404).json({ error: 'Booking not found.' });
  if (row.payment_status !== 'paid') {
    // Demo mode "charges" the card and records the payment.
    markPaid.run('demo', `demo_${Date.now()}`, reference);
  }
  res.json({ ok: true, reference, booking: publicBooking(getBookingByRef.get(reference)) });
});

// ---- Admin (token-protected) -----------------------------------------------
function requireAdmin(req, res, next) {
  const token = req.get('x-admin-token') || req.query.token;
  if (token !== config.adminToken) {
    return res.status(401).json({ error: 'Unauthorized. Provide a valid admin token.' });
  }
  next();
}

api.get('/admin/bookings', requireAdmin, (_req, res) => {
  const rows = db
    .prepare(`
      SELECT b.*, s.name AS service_name, s.icon AS service_icon
      FROM bookings b JOIN services s ON s.id = b.service_id
      ORDER BY b.scheduled_date DESC, b.scheduled_time DESC, b.id DESC
    `)
    .all()
    .map((r) => ({ ...publicBooking(r), service_name: r.service_name, service_icon: r.service_icon }));

  const stats = {
    total: rows.length,
    upcoming: rows.filter((r) => r.status === 'confirmed' || r.status === 'pending').length,
    revenue_cents: rows.filter((r) => r.payment_status === 'paid').reduce((a, r) => a + r.amount_cents, 0),
  };
  stats.revenue_display = money(stats.revenue_cents);
  res.json({ bookings: rows, stats });
});

api.post('/admin/bookings/:reference/status', requireAdmin, (req, res) => {
  const allowed = ['pending', 'confirmed', 'completed', 'cancelled'];
  const status = String((req.body && req.body.status) || '');
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const result = db
    .prepare('UPDATE bookings SET status = ? WHERE reference = ?')
    .run(status, String(req.params.reference));
  if (result.changes === 0) return res.status(404).json({ error: 'Booking not found.' });
  res.json({ ok: true });
});
