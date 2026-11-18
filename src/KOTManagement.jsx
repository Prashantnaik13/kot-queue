import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaPlay,
  FaCheckCircle,
  FaSyncAlt,
  FaUtensils,
  FaExclamationTriangle,
} from 'react-icons/fa';
import { fetchKots, updateKotStatus } from './api/kotApi';
import {
  formatDuration,
  formatOrderDate,
  formatOrderTime,
  formatRefreshTime,
  getElapsedSeconds,
  getWaitLevel,
  parseTimestamp,
} from './utils/timeUtils';
import './KOTManagement.css';

const POLL_INTERVAL_MS = 5000;
const TOAST_DURATION_MS = 4000;

const STATUS = {
  PENDING: 'Pending',
  IN_PROCESS: 'In Process',
  COMPLETED: 'Completed',
};

// A status can only move forward. Used to keep local changes when a stale poll arrives.
const STATUS_RANK = {
  [STATUS.PENDING]: 0,
  [STATUS.IN_PROCESS]: 1,
  [STATUS.COMPLETED]: 2,
};

const statusClass = (status) => `status-${status.toLowerCase().replace(/\s+/g, '-')}`;

/**
 * Merge a fresh server list into local state:
 *  - de-duplicates by id
 *  - keeps a locally-updated status if the server hasn't caught up yet
 */
function mergeServerOrders(serverOrders, overrides) {
  const byId = new Map();
  serverOrders.forEach((order) => {
    const override = overrides[order.id];
    if (override === undefined) {
      byId.set(order.id, order);
    } else if ((STATUS_RANK[order.status] ?? 0) >= STATUS_RANK[override]) {
      delete overrides[order.id]; // server caught up
      byId.set(order.id, order);
    } else {
      byId.set(order.id, { ...order, status: override });
    }
  });
  return Array.from(byId.values());
}

/** One shared 1-second clock. Every row derives its own timer from created_at, so polling never resets it. */
function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function KOTManagement() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [busyIds, setBusyIds] = useState([]);
  const [toast, setToast] = useState(null);

  const now = useNow(1000);

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const overridesRef = useRef({}); // id -> status set locally, waiting for server confirmation
  const pendingUpdatesRef = useRef(new Set());

  // ---------------------------------------------------------------- fetching
  const loadOrders = useCallback(async ({ manual = false } = {}) => {
    if (inFlightRef.current) return; // never run two requests at once
    inFlightRef.current = true;
    if (manual) setRefreshing(true);

    try {
      const data = await fetchKots();
      if (!mountedRef.current) return;
      setOrders(mergeServerOrders(data, overridesRef.current));
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      if (mountedRef.current) {
        setError(err?.message || 'Unable to reach the order service.');
      }
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // Initial load + 5-second polling (cleaned up on unmount)
  useEffect(() => {
    mountedRef.current = true;
    loadOrders();
    const id = setInterval(() => loadOrders(), POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [loadOrders]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(id);
  }, [toast]);

  // ----------------------------------------------------------------- actions
  const changeStatus = useCallback(async (order, newStatus) => {
    if (order.status === newStatus) return; // no repeated updates
    if (pendingUpdatesRef.current.has(order.id)) return; // request already running

    const previousStatus = order.status;
    pendingUpdatesRef.current.add(order.id);
    setBusyIds(Array.from(pendingUpdatesRef.current));

    // Optimistic update + remember it so a stale poll can't undo it
    overridesRef.current[order.id] = newStatus;
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o)));

    try {
      await updateKotStatus(order.id, newStatus);
      if (newStatus === STATUS.COMPLETED) {
        const took = formatDuration(getElapsedSeconds(order.created_at));
        setToast({ type: 'success', message: `${order.kot_id} completed after ${took}.` });
      }
    } catch (err) {
      delete overridesRef.current[order.id];
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: previousStatus } : o))
      );
      setToast({
        type: 'error',
        message: `Could not update ${order.kot_id}. ${err?.message || 'Please try again.'}`,
      });
    } finally {
      pendingUpdatesRef.current.delete(order.id);
      setBusyIds(Array.from(pendingUpdatesRef.current));
    }
  }, []);

  // ----------------------------------------------------------- derived state
  // Oldest first, by the real created_at timestamp. Completed orders leave the queue.
  const activeOrders = useMemo(
    () =>
      orders
        .filter((o) => o.status !== STATUS.COMPLETED)
        .sort((a, b) => parseTimestamp(a.created_at) - parseTimestamp(b.created_at) || a.id - b.id),
    [orders]
  );

  const pendingCount = activeOrders.filter((o) => o.status === STATUS.PENDING).length;
  const inProcessCount = activeOrders.length - pendingCount;

  // ------------------------------------------------------------------ render
  const showInitialLoader = loading && orders.length === 0;
  const showBlockingError = !!error && orders.length === 0 && !loading;

  return (
    <div className="kot-page">
      <header className="kot-header">
        <div className="kot-title-block">
          <div className="kot-title-row">
            <h1>Kitchen Order Tickets</h1>
            <span className="live-badge" aria-label="Live orders">
              <span className="live-dot" />
              LIVE ORDERS
            </span>
          </div>
          <p className="kot-subtitle">Oldest order first. Mark each ticket as it moves through the kitchen.</p>
        </div>

        <div className="kot-stats">
          <div className="stat stat-main">
            <span className="stat-value">{activeOrders.length}</span>
            <span className="stat-label">Active queue</span>
          </div>
          <div className="stat">
            <span className="stat-value stat-value-pending">{pendingCount}</span>
            <span className="stat-label">Pending</span>
          </div>
          <div className="stat">
            <span className="stat-value stat-value-process">{inProcessCount}</span>
            <span className="stat-label">In process</span>
          </div>
          <div className="refresh-block">
            <span className="refresh-time">
              Last refresh {lastRefresh ? formatRefreshTime(lastRefresh) : '—'}
            </span>
            <button
              type="button"
              className="refresh-btn"
              onClick={() => loadOrders({ manual: true })}
              disabled={refreshing}
            >
              <FaSyncAlt className={refreshing ? 'spin' : ''} aria-hidden="true" />
              {refreshing ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      {error && orders.length > 0 && (
        <div className="error-banner" role="alert">
          <FaExclamationTriangle aria-hidden="true" />
          <span>Couldn’t refresh orders: {error}. Showing the last known data and retrying every 5 seconds.</span>
        </div>
      )}

      <main className="table-card">
        {showInitialLoader && (
          <div className="state-panel" role="status">
            <div className="loader" />
            <p className="state-title">Loading orders…</p>
          </div>
        )}

        {showBlockingError && (
          <div className="state-panel" role="alert">
            <FaExclamationTriangle className="state-icon state-icon-error" aria-hidden="true" />
            <p className="state-title">Orders could not be loaded</p>
            <p className="state-text">{error}</p>
            <button type="button" className="refresh-btn" onClick={() => loadOrders({ manual: true })}>
              <FaSyncAlt aria-hidden="true" /> Try again
            </button>
          </div>
        )}

        {!showInitialLoader && !showBlockingError && activeOrders.length === 0 && (
          <div className="state-panel">
            <FaUtensils className="state-icon" aria-hidden="true" />
            <p className="state-title">No active orders</p>
            <p className="state-text">New tickets appear here automatically as soon as they are placed.</p>
          </div>
        )}

        {!showInitialLoader && !showBlockingError && activeOrders.length > 0 && (
          <div className="table-scroll">
            <table className="kot-table">
              <thead>
                <tr>
                  <th className="col-queue">Queue No.</th>
                  <th className="col-kot">KOT ID</th>
                  <th className="col-items">Items</th>
                  <th className="col-time">Order Date &amp; Time</th>
                  <th className="col-wait">Waiting Time</th>
                  <th className="col-status">Status</th>
                  <th className="col-action">Action</th>
                </tr>
              </thead>
              <tbody>
                {activeOrders.map((order, index) => {
                  const elapsed = getElapsedSeconds(order.created_at, now);
                  const level = getWaitLevel(elapsed);
                  const busy = busyIds.includes(order.id);
                  const inProcess = order.status === STATUS.IN_PROCESS;

                  return (
                    <tr key={order.id} className={`is-${level}`}>
                      <td className="col-queue">
                        <span className="queue-no">{index + 1}</span>
                      </td>
                      <td className="col-kot">
                        <span className="kot-id">{order.kot_id}</span>
                      </td>
                      <td className="col-items">
                        <ul className="item-list">
                          {order.items.map((item, i) => (
                            <li key={`${item.item_name}-${i}`}>
                              <span className="item-qty">{item.quantity}×</span>
                              {item.item_name}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="col-time">
                        <span className="time-main">{formatOrderTime(order.created_at)}</span>
                        <span className="time-sub">{formatOrderDate(order.created_at)}</span>
                      </td>
                      <td className="col-wait">
                        <span className={`wait wait-${level}`}>
                          {level !== 'normal' && <FaExclamationTriangle aria-label="Long wait" />}
                          {formatDuration(elapsed)}
                        </span>
                      </td>
                      <td className="col-status">
                        <span className={`status-badge ${statusClass(order.status)}`}>{order.status}</span>
                      </td>
                      <td className="col-action">
                        <div className="actions">
                          <span
                            className="tooltip-wrap"
                            data-tooltip={inProcess ? 'Already in process' : 'Start cooking'}
                          >
                            <button
                              type="button"
                              className="icon-btn btn-process"
                              onClick={() => changeStatus(order, STATUS.IN_PROCESS)}
                              disabled={inProcess || busy}
                              aria-label={`Mark ${order.kot_id} as in process`}
                            >
                              <FaPlay aria-hidden="true" />
                            </button>
                          </span>
                          <span className="tooltip-wrap" data-tooltip="Mark as completed">
                            <button
                              type="button"
                              className="icon-btn btn-complete"
                              onClick={() => changeStatus(order, STATUS.COMPLETED)}
                              disabled={busy}
                              aria-label={`Mark ${order.kot_id} as completed`}
                            >
                              <FaCheckCircle aria-hidden="true" />
                            </button>
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {toast && (
        <div className={`toast toast-${toast.type}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      )}
    </div>
  );
}
