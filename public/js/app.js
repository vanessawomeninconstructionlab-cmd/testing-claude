// Front-end logic for the CoolAir booking wizard.
const state = {
  services: [],
  selectedService: null,
  selectedDate: null,
  selectedTime: null,
  paymentMode: 'demo',
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDateLong(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const hr = ((h + 11) % 12) + 1;
  return `${hr}:${String(m).padStart(2, '0')} ${ap}`;
}

// ---- Load catalog ----------------------------------------------------------
async function loadServices() {
  const res = await fetch('/api/services');
  const data = await res.json();
  state.services = data.services;
  state.paymentMode = data.paymentMode;
  if (state.paymentMode === 'demo') $('#demoBanner').style.display = 'block';
  renderServicePicker();
  renderShowcase();
}

function renderServicePicker() {
  const el = $('#serviceList');
  el.innerHTML = '';
  for (const s of state.services) {
    const card = document.createElement('div');
    card.className = 'service-card';
    card.dataset.id = s.id;
    card.innerHTML = `
      <div class="icon">${s.icon}</div>
      <div class="cat">${s.category}</div>
      <h4>${s.name}</h4>
      <div class="desc">${s.description}</div>
      <div class="meta">
        <span class="price">${s.amount_display}</span>
        <span class="dur">${s.duration_min} min</span>
      </div>`;
    card.addEventListener('click', () => selectService(s, card));
    el.appendChild(card);
  }
}

function renderShowcase() {
  const el = $('#servicesShowcase');
  if (!el) return;
  el.innerHTML = '';
  for (const s of state.services) {
    const card = document.createElement('div');
    card.className = 'service-card';
    card.innerHTML = `
      <div class="icon">${s.icon}</div>
      <div class="cat">${s.category}</div>
      <h4>${s.name}</h4>
      <div class="desc">${s.description}</div>
      <div class="meta">
        <span class="price">${s.amount_display}</span>
        <span class="dur">${s.duration_min} min</span>
      </div>`;
    card.addEventListener('click', () => {
      const picker = $(`.service-card[data-id="${s.id}"]`);
      if (picker) { selectService(s, picker); }
      $('#book').scrollIntoView({ behavior: 'smooth' });
    });
    el.appendChild(card);
  }
}

function selectService(service, card) {
  state.selectedService = service;
  $$('#serviceList .service-card').forEach((c) => c.classList.remove('selected'));
  card.classList.add('selected');
  $('#toStep2').disabled = false;
}

// ---- Steps -----------------------------------------------------------------
function goStep(n) {
  $$('.panel').forEach((p) => (p.hidden = p.dataset.panel !== String(n)));
  $$('.step').forEach((s) => {
    const step = Number(s.dataset.step);
    s.classList.toggle('active', step === n);
    s.classList.toggle('done', step < n);
  });
  window.scrollTo({ top: $('#book').offsetTop - 60, behavior: 'smooth' });
}

// ---- Dates & slots ---------------------------------------------------------
async function loadDates() {
  const res = await fetch('/api/availability');
  const { dates } = await res.json();
  const el = $('#dateScroller');
  el.innerHTML = '';
  for (const ds of dates) {
    const d = new Date(`${ds}T12:00:00`);
    const chip = document.createElement('div');
    chip.className = 'date-chip';
    chip.dataset.date = ds;
    chip.innerHTML = `
      <div class="dow">${d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
      <div class="day">${d.getDate()}</div>
      <div class="mon">${d.toLocaleDateString(undefined, { month: 'short' })}</div>`;
    chip.addEventListener('click', () => selectDate(ds, chip));
    el.appendChild(chip);
  }
}

async function selectDate(ds, chip) {
  state.selectedDate = ds;
  state.selectedTime = null;
  $('#toStep3').disabled = true;
  $$('.date-chip').forEach((c) => c.classList.remove('selected'));
  chip.classList.add('selected');
  const grid = $('#slotGrid');
  grid.innerHTML = '<p class="muted">Loading times…</p>';
  const res = await fetch(`/api/availability?date=${ds}`);
  const { slots } = await res.json();
  grid.innerHTML = '';
  if (!slots.length) { grid.innerHTML = '<p class="muted">No times available on this date.</p>'; return; }
  for (const slot of slots) {
    const b = document.createElement('button');
    b.className = 'slot';
    b.textContent = fmtTime(slot.time);
    b.disabled = !slot.available;
    b.addEventListener('click', () => {
      state.selectedTime = slot.time;
      $$('.slot').forEach((s) => s.classList.remove('selected'));
      b.classList.add('selected');
      $('#toStep3').disabled = false;
    });
    grid.appendChild(b);
  }
}

// ---- Summary ---------------------------------------------------------------
function fillSummary() {
  const s = state.selectedService;
  $('#sumService').textContent = s ? `${s.icon} ${s.name}` : '—';
  $('#sumDate').textContent = state.selectedDate ? fmtDateLong(state.selectedDate) : '—';
  $('#sumTime').textContent = state.selectedTime ? fmtTime(state.selectedTime) : '—';
  $('#sumDur').textContent = s ? `${s.duration_min} min` : '—';
  $('#sumPrice').textContent = s ? s.amount_display : '—';
}

// ---- Submit & pay ----------------------------------------------------------
async function submitBooking() {
  const form = $('#bookingForm');
  if (!form.reportValidity()) return;
  const errorEl = $('#formError');
  errorEl.style.display = 'none';

  const payBtn = $('#payBtn');
  payBtn.disabled = true;
  $('#payBtnText').innerHTML = '<span class="spinner"></span>';

  const payload = {
    service_id: state.selectedService.id,
    scheduled_date: state.selectedDate,
    scheduled_time: state.selectedTime,
    customer_name: $('#customer_name').value,
    email: $('#email').value,
    phone: $('#phone').value,
    address: $('#address').value,
    city: $('#city').value,
    zip: $('#zip').value,
    notes: $('#notes').value,
  };

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not create booking.');
    // Redirect to checkout (Stripe URL or in-app demo pay page).
    window.location.href = data.checkoutUrl;
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
    payBtn.disabled = false;
    $('#payBtnText').textContent = 'Confirm & pay';
  }
}

// ---- Wire up ---------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  loadServices();
  loadDates();

  $('#toStep2').addEventListener('click', () => goStep(2));
  $('#toStep3').addEventListener('click', () => { fillSummary(); goStep(3); });
  $$('[data-back]').forEach((b) => b.addEventListener('click', () => goStep(Number(b.dataset.back))));
  $('#payBtn').addEventListener('click', submitBooking);

  const params = new URLSearchParams(location.search);
  if (params.get('canceled')) $('#canceledBanner').style.display = 'block';
});
