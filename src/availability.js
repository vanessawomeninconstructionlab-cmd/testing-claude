// Availability engine: generates bookable time slots and checks capacity.
import { db } from './db.js';

// Business rules.
const OPEN_HOUR = 8; // 8:00 AM
const CLOSE_HOUR = 17; // last job starts at 16:00, shop closes 17:00
const SLOT_TIMES = [];
for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
  SLOT_TIMES.push(`${String(h).padStart(2, '0')}:00`);
}
// How many technicians can be dispatched in the same slot.
const CREW_CAPACITY = 2;
// How far ahead customers can book.
const BOOKING_WINDOW_DAYS = 30;

const countAtSlot = db.prepare(`
  SELECT COUNT(*) AS n FROM bookings
  WHERE scheduled_date = ? AND scheduled_time = ? AND status != 'cancelled'
`);

function isClosedDay(date) {
  // date is a YYYY-MM-DD string. Closed on Sundays (getUTCDay() === 0).
  const d = new Date(`${date}T12:00:00Z`);
  return d.getUTCDay() === 0;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function toDateStr(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Returns the list of dates (YYYY-MM-DD) the shop is open within the window.
export function openDates() {
  const dates = [];
  const start = new Date();
  start.setUTCHours(12, 0, 0, 0);
  for (let i = 1; i <= BOOKING_WINDOW_DAYS; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const ds = toDateStr(d);
    if (!isClosedDay(ds)) dates.push(ds);
  }
  return dates;
}

// Returns available time slots for a given date.
export function slotsForDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isClosedDay(date)) return [];
  return SLOT_TIMES.map((time) => {
    const { n } = countAtSlot.get(date, time);
    return { time, available: n < CREW_CAPACITY, remaining: Math.max(0, CREW_CAPACITY - n) };
  });
}

// True if a specific date/time can still take a booking.
export function isSlotBookable(date, time) {
  if (isClosedDay(date)) return false;
  if (!SLOT_TIMES.includes(time)) return false;
  const validDates = new Set(openDates());
  if (!validDates.has(date)) return false;
  const { n } = countAtSlot.get(date, time);
  return n < CREW_CAPACITY;
}

export const businessHours = { OPEN_HOUR, CLOSE_HOUR, SLOT_TIMES, CREW_CAPACITY, BOOKING_WINDOW_DAYS };
