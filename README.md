# KOT Live Order Management (single page)

## Run it

```bash
cd kot-app
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

Starting from your own Vite app instead? Run `npm install react-icons`, then copy
`src/KOTManagement.jsx`, `src/KOTManagement.css`, `src/api/`, `src/utils/` and `public/kotData.json`
into it and render `<KOTManagement />`. Remove the default `import './index.css'` from `main.jsx`.

## Files

| File | Purpose |
|---|---|
| `src/KOTManagement.jsx` | The page: table, polling, timers, actions |
| `src/KOTManagement.css` | All styling |
| `public/kotData.json` | Dummy API response |
| `src/api/kotApi.js` | `fetchKots()` and `updateKotStatus()` (only file that talks to the data source) |
| `src/utils/timeUtils.js` | Duration / date / time formatting helpers |

## Mock mode (default)

- `kotApi.js` fetches `/kotData.json` and keeps status changes in memory, so Completed / In Process work without a server.
- Timestamps in the sample file are shifted so the oldest order is 12 minutes old when you open the page. Set `REBASE_DEMO_TIMES = false` to use the file's exact times.
- A new order arrives about every 45 seconds. Set `SIMULATE_NEW_ORDERS = false` to turn that off.
- Refreshing the browser resets the mock data.

## Connect a real Node/Express backend later

In `src/api/kotApi.js`:

```js
export const USE_MOCK = false;
export const API_BASE_URL = 'http://localhost:5000/api';
```

Your backend needs two endpoints:

```
GET   /api/kots              -> [{ id, kot_id, items: [{ item_name, quantity }], created_at, status }]
PATCH /api/kots/:id/status   body { "status": "In Process" | "Completed" }  -> updated KOT
```

Minimal Express example (enable CORS for the Vite origin):

```js
const express = require('express');
const cors = require('cors');
const kots = require('./kotData.json');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/kots', (req, res) => res.json(kots));

app.patch('/api/kots/:id/status', (req, res) => {
  const kot = kots.find((k) => k.id === Number(req.params.id));
  if (!kot) return res.status(404).json({ message: 'KOT not found' });
  kot.status = req.body.status;
  res.json(kot);
});

app.listen(5000);
```

No frontend changes are needed beyond the two constants above.

## How the key requirements are met

- **Sorting / queue numbers:** active orders are sorted by `created_at` on every render; Queue No. is the row's position in that list, so it is always correct after adds or completions.
- **Timers:** one 1-second clock; each row computes `Date.now() - created_at` itself. Polling replaces data but never touches the clock, so timers never reset. The interval is cleared on unmount.
- **Polling:** every 5 seconds, plus the Refresh button. A request is skipped if one is already running, so there are no duplicate calls. Results are merged by `id`, so there are no duplicate rows.
- **Status changes:** applied instantly, sent through `updateKotStatus()`, and rolled back with an error message if the call fails. A poll that returns an older status cannot undo a change you just made.
- **Completed:** the order leaves the table immediately and a toast shows how long it took.
- **Long waits:** rows turn amber after 10 minutes and red after 20 (change `WAIT_WARN_SECONDS` / `WAIT_CRITICAL_SECONDS` in `timeUtils.js`).
