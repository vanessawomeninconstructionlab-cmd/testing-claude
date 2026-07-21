// Minimal, dependency-free environment loader + typed config.
// Reads a ".env" file (if present) into process.env, then exposes config.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function loadDotEnv() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const stripeKey = (process.env.STRIPE_SECRET_KEY || '').trim();

export const config = {
  rootDir,
  port: Number(process.env.PORT || 3000),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  adminToken: (process.env.ADMIN_TOKEN || 'admin').trim(),
  stripeSecretKey: stripeKey,
  // When there is no Stripe key we run a fully functional demo payment flow.
  paymentMode: stripeKey ? 'stripe' : 'demo',
  dataDir: path.join(rootDir, 'data'),
};
