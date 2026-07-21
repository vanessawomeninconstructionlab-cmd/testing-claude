// Seeds the catalog of HVAC services. Safe to run repeatedly (idempotent upsert).
import { db } from './db.js';

const SERVICES = [
  {
    slug: 'ac-tuneup',
    name: 'A/C Tune-Up & Inspection',
    category: 'Maintenance',
    description:
      'A 21-point precision tune-up: clean coils, check refrigerant, test capacitors, and verify airflow so your system runs efficiently all summer.',
    price_cents: 8900,
    duration_min: 60,
    icon: '❄️',
  },
  {
    slug: 'furnace-tuneup',
    name: 'Furnace Tune-Up & Safety Check',
    category: 'Maintenance',
    description:
      'Full heating inspection with burner cleaning, heat-exchanger crack check, and carbon-monoxide safety test to keep your home warm and safe.',
    price_cents: 8900,
    duration_min: 60,
    icon: '🔥',
  },
  {
    slug: 'ac-repair',
    name: 'A/C Repair Diagnostic',
    category: 'Repair',
    description:
      'Not cooling? A certified technician diagnoses the fault and gives you an upfront repair quote. Diagnostic fee applies to the repair if you proceed.',
    price_cents: 9900,
    duration_min: 90,
    icon: '🛠️',
  },
  {
    slug: 'heating-repair',
    name: 'Heating System Repair',
    category: 'Repair',
    description:
      'No heat or uneven heating? We troubleshoot furnaces, heat pumps, and thermostats and get your system running again fast.',
    price_cents: 9900,
    duration_min: 90,
    icon: '🌡️',
  },
  {
    slug: 'install-consult',
    name: 'New System Install Consultation',
    category: 'Installation',
    description:
      'In-home assessment and load calculation for a new A/C, furnace, or heat pump. Get a detailed, no-pressure written estimate. Fee credited toward install.',
    price_cents: 4900,
    duration_min: 60,
    icon: '🏠',
  },
  {
    slug: 'duct-cleaning',
    name: 'Air Duct Cleaning',
    category: 'Indoor Air Quality',
    description:
      'Deep-clean your ductwork to remove dust, allergens, and debris — improving airflow and the air your family breathes.',
    price_cents: 24900,
    duration_min: 120,
    icon: '💨',
  },
  {
    slug: 'thermostat-install',
    name: 'Smart Thermostat Installation',
    category: 'Installation',
    description:
      'Professional installation and setup of a smart/Wi-Fi thermostat, including app configuration and a walkthrough. Thermostat priced separately.',
    price_cents: 12900,
    duration_min: 60,
    icon: '📱',
  },
  {
    slug: 'emergency',
    name: 'Emergency No-Cool / No-Heat Visit',
    category: 'Repair',
    description:
      'Same-day priority dispatch when your system fails. A technician is routed to you as soon as possible to restore comfort.',
    price_cents: 14900,
    duration_min: 90,
    icon: '🚨',
  },
];

const upsert = db.prepare(`
  INSERT INTO services (slug, name, category, description, price_cents, duration_min, icon, active)
  VALUES (@slug, @name, @category, @description, @price_cents, @duration_min, @icon, 1)
  ON CONFLICT(slug) DO UPDATE SET
    name = excluded.name,
    category = excluded.category,
    description = excluded.description,
    price_cents = excluded.price_cents,
    duration_min = excluded.duration_min,
    icon = excluded.icon,
    active = 1
`);

const run = db.transaction((rows) => {
  for (const row of rows) upsert.run(row);
});

run(SERVICES);

console.log(`Seeded ${SERVICES.length} services into the catalog.`);
