/**
 * KOT API layer — the only file that knows where data comes from.
 *
 * MOCK MODE (default):  reads /kotData.json with fetch() and keeps changes in memory.
 * REAL BACKEND:         set USE_MOCK = false and point API_BASE_URL to your Express server.
 *
 * Expected backend contract:
 *   GET   {API_BASE_URL}/kots              -> [{ id, kot_id, items[], created_at, status }]
 *   PATCH {API_BASE_URL}/kots/:id/status   body: { "status": "In Process" | "Completed" }
 *                                          -> updated KOT object
 */

export const USE_MOCK = true;
export const API_BASE_URL = 'http://localhost:5000/api';

// ---- Mock-only settings (ignored when USE_MOCK = false) ----
const MOCK_DATA_URL = '/kotData.json';
const MOCK_LATENCY_MS = 300;
// The sample file has fixed timestamps. Shift them so the oldest order is "12 minutes ago"
// and the timers are meaningful whenever you run the demo.
const REBASE_DEMO_TIMES = true;
const REBASE_OLDEST_MINUTES_AGO = 12;
// Simulate the kitchen receiving a new order every so often.
const SIMULATE_NEW_ORDERS = true;
const NEW_ORDER_EVERY_MS = 45 * 1000;

const MENU = [
  'Veg Burger',
  'Hakka Noodles',
  'Butter Naan',
  'Dal Makhani',
  'Veg Pizza',
  'Cold Coffee',
  'Paneer Tikka',
  'Masala Dosa',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clone = (value) => JSON.parse(JSON.stringify(value));

// ---------------------------------------------------------------------------
// Real HTTP helper
// ---------------------------------------------------------------------------
async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status} ${response.statusText})`);
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// Mock "database" (in-memory, loaded once from kotData.json)
// ---------------------------------------------------------------------------
let mockDb = null;
let mockDbLoading = null;
let lastSpawnAt = 0;

function rebaseTimes(orders) {
  if (!orders.length) return orders;
  const oldest = Math.min(...orders.map((o) => new Date(o.created_at).getTime()));
  const shift = Date.now() - REBASE_OLDEST_MINUTES_AGO * 60 * 1000 - oldest;
  return orders.map((o) => ({
    ...o,
    created_at: new Date(new Date(o.created_at).getTime() + shift).toISOString(),
  }));
}

async function loadMockDb() {
  if (mockDb) return mockDb;
  if (!mockDbLoading) {
    mockDbLoading = fetch(MOCK_DATA_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load ${MOCK_DATA_URL} (${res.status})`);
        return res.json();
      })
      .then((data) => {
        mockDb = REBASE_DEMO_TIMES ? rebaseTimes(data) : data;
        lastSpawnAt = Date.now();
        return mockDb;
      })
      .finally(() => {
        mockDbLoading = null;
      });
  }
  return mockDbLoading;
}

function maybeSpawnOrder(db) {
  if (!SIMULATE_NEW_ORDERS) return;
  const now = Date.now();
  if (now - lastSpawnAt < NEW_ORDER_EVERY_MS) return;
  lastSpawnAt = now;

  const nextId = Math.max(0, ...db.map((o) => o.id)) + 1;
  const pick = () => MENU[Math.floor(Math.random() * MENU.length)];
  const first = pick();
  let second = pick();
  while (second === first) second = pick();

  db.push({
    id: nextId,
    kot_id: `KOT-${1000 + nextId}`,
    items: [
      { item_name: first, quantity: 1 + Math.floor(Math.random() * 3) },
      { item_name: second, quantity: 1 },
    ],
    created_at: new Date(now).toISOString(),
    status: 'Pending',
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Fetch all KOTs. */
export async function fetchKots() {
  if (!USE_MOCK) return request('/kots');

  await sleep(MOCK_LATENCY_MS);
  const db = await loadMockDb();
  maybeSpawnOrder(db);
  return clone(db);
}

/** Update the status of a single KOT. */
export async function updateKotStatus(id, status) {
  if (!USE_MOCK) {
    return request(`/kots/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  await sleep(MOCK_LATENCY_MS);
  const db = await loadMockDb();
  const order = db.find((o) => o.id === id);
  if (!order) throw new Error('KOT not found');
  order.status = status;
  return clone(order);
}
