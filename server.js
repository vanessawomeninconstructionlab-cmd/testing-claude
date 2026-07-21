// CoolAir HVAC — booking & payment web server.
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './src/config.js';
import { db } from './src/db.js';
import { api } from './src/routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Seed the service catalog on boot if it is empty.
const serviceCount = db.prepare('SELECT COUNT(*) AS n FROM services').get().n;
if (serviceCount === 0) {
  await import('./src/seed.js');
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Expose a tiny runtime config to the frontend.
app.get('/api/config', (_req, res) => {
  res.json({ paymentMode: config.paymentMode, publicBaseUrl: config.publicBaseUrl });
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api', api);

// Static frontend.
app.use(express.static(path.join(__dirname, 'public')));

// SPA-ish fallback for the a few known pages; otherwise 404.
app.get('*', (req, res) => {
  const file = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(file)) return res.sendFile(file);
  res.status(404).send('Not found');
});

app.listen(config.port, () => {
  console.log('');
  console.log('  🌬️  CoolAir HVAC booking app is running');
  console.log(`     Local:        http://localhost:${config.port}`);
  console.log(`     Admin:        http://localhost:${config.port}/admin.html  (token: ${config.adminToken})`);
  console.log(`     Payment mode: ${config.paymentMode.toUpperCase()}${config.paymentMode === 'demo' ? ' (simulated — set STRIPE_SECRET_KEY for live payments)' : ''}`);
  console.log('');
});
