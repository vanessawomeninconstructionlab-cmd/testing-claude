# 🌬️ CoolAir HVAC — Online Booking & Payment App

A complete, end-to-end web app for an HVAC company: customers browse services,
pick an available time slot, enter their details, and **pay online** — all in
one flow. Staff get an admin dashboard to see bookings, revenue, and update job
status.

It works **out of the box with zero external accounts** thanks to a built-in
demo payment mode, and flips to **real Stripe payments** the moment you add an
API key.

---

## ✨ Features

**For customers**
- Browse a catalog of HVAC services with upfront pricing (tune-ups, repairs,
  installs, duct cleaning, smart thermostats, emergency visits).
- 3-step booking wizard: **Service → Date & Time → Details & Pay**.
- Live availability — real open dates/times based on crew capacity, no
  double-booking.
- Secure online checkout (Stripe Checkout, or a simulated demo checkout).
- Instant confirmation page with a booking reference and printable receipt.

**For staff**
- Token-protected admin dashboard at `/admin.html`.
- At-a-glance stats: total bookings, active jobs, revenue collected.
- Full bookings table with one-click status updates
  (pending → confirmed → completed → cancelled).

**Under the hood**
- Node.js + Express API, SQLite storage (file-based, no DB server to run).
- Payment abstraction that supports Stripe or a demo fallback.
- Automated end-to-end test suite (`npm test`).

---

## 🚀 Quick start

```bash
npm install
npm start
```

Then open **http://localhost:3000**.

- Customer booking flow: http://localhost:3000
- Staff dashboard: http://localhost:3000/admin.html  (default token: `admin`)

That's it — the service catalog is seeded automatically on first run, and
payments run in **demo mode** (a simulated card screen, pre-filled with a test
card, no real charge).

---

## 💳 Taking real payments (Stripe)

1. Copy the env template and add your Stripe **secret** key:

   ```bash
   cp .env.example .env
   ```

   ```env
   STRIPE_SECRET_KEY=sk_test_...          # from dashboard.stripe.com/apikeys
   PUBLIC_BASE_URL=http://localhost:3000  # your real domain in production
   ADMIN_TOKEN=choose-a-strong-token
   ```

2. Restart the app. The startup log will now show `Payment mode: STRIPE`.

Customers are redirected to Stripe Checkout to pay; on success they land back on
the confirmation page and the booking is marked **paid + confirmed**. Use
Stripe's test card `4242 4242 4242 4242` while in test mode.

> No key set? The app stays in demo mode so you can try the entire flow
> immediately.

---

## 🧭 How the flow works

```
Customer                     App                              Payment
   │  pick service            │                                 │
   │─────────────────────────▶│                                 │
   │  pick date/time          │  checks availability            │
   │─────────────────────────▶│  (crew capacity, no clashes)    │
   │  enter details           │                                 │
   │─────────────────────────▶│  POST /api/bookings             │
   │                          │  creates booking (pending)      │
   │                          │─── create checkout ────────────▶│
   │◀───── redirect to checkout ──────────────────────────────  │
   │  pay                     │                                 │
   │──────────────────────────────────────────────────────────▶│
   │◀── success redirect ─────│  marks paid + confirmed         │
   │  confirmation + receipt  │                                 │
```

---

## 🔌 API reference

| Method | Endpoint                              | Description                          |
|--------|---------------------------------------|--------------------------------------|
| GET    | `/api/services`                       | List active services + pricing       |
| GET    | `/api/availability`                   | Open dates (next 30 days)            |
| GET    | `/api/availability?date=YYYY-MM-DD`   | Time slots for a date                |
| POST   | `/api/bookings`                       | Create booking, returns checkout URL |
| GET    | `/api/bookings/:reference`            | Fetch a booking (confirmation)       |
| GET    | `/api/payments/confirm`               | Stripe success redirect target       |
| POST   | `/api/payments/confirm`               | Demo-mode payment confirmation       |
| GET    | `/api/admin/bookings`                 | All bookings + stats *(admin token)* |
| POST   | `/api/admin/bookings/:reference/status` | Update job status *(admin token)*  |

Admin endpoints require the header `x-admin-token: <ADMIN_TOKEN>`.

---

## ⚙️ Configuration

All settings are optional (see `.env.example`):

| Variable               | Default                  | Purpose                                   |
|------------------------|--------------------------|-------------------------------------------|
| `PORT`                 | `3000`                   | Web server port                           |
| `STRIPE_SECRET_KEY`    | *(empty)*                | Enables live Stripe payments              |
| `PUBLIC_BASE_URL`      | `http://localhost:3000`  | Base URL for Stripe redirect links        |
| `ADMIN_TOKEN`          | `admin`                  | Password for the staff dashboard          |

Business rules (hours, slot length, crew capacity, booking window) live in
`src/availability.js` and are easy to tweak. The service catalog lives in
`src/seed.js`.

---

## 🧪 Tests

```bash
npm test
```

Covers the health check, catalog seeding, availability, input validation, the
full create-booking → pay → confirm flow, admin auth, and double-booking
protection.

---

## 📁 Project structure

```
server.js              Express app + startup
src/
  config.js            Env loading & typed config
  db.js                SQLite schema
  seed.js              Service catalog
  availability.js      Slot generation & capacity checks
  payments.js          Stripe / demo payment abstraction
  routes.js            REST API
public/
  index.html           Booking wizard (landing page)
  pay.html             Demo checkout screen
  confirmation.html    Receipt / confirmation
  admin.html           Staff dashboard
  css/styles.css
  js/app.js
test/api.test.js       End-to-end tests
```

---

## 🛠️ Tech

Node.js · Express · better-sqlite3 · Stripe · vanilla JS frontend (no build step).

Licensed MIT. Replace the placeholder company name, phone, license number, and
branding in `public/` with your own.
