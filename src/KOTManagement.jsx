import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchKots, updateKotStatus } from './api/kotApi';
import {
  getElapsedSeconds,
  formatDuration,
  getWaitLevel,
  formatOrderTime,
  formatRefreshTime,
} from './utils/timeUtils';
import './KOTManagement.css';

// Professional SVG Icons
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86z" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const ChefHatIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 13.8a4 4 0 0 1-1.5-7.8A4.5 4.5 0 0 1 13 4.2a4.5 4.5 0 0 1 8.5 1.8 4 4 0 0 1-1.5 7.8" />
    <path d="M6 14h12v4a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-4z" />
    <line x1="6" y1="17" x2="18" y2="17" />
  </svg>
);

const RefreshIcon = ({ spinning }) => (
  <svg className={`refresh-svg ${spinning ? 'spin' : ''}`} viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const AlertTriangleIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const NoteIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const STATUS = {
  PENDING: 'Pending',
  IN_PROCESS: 'In Process',
  COMPLETED: 'Completed',
};

const POLL_INTERVAL_MS = 3000;

export default function KOTManagement() {
  const [kots, setKots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [updatingId, setUpdatingId] = useState(null);
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'Pending' | 'In Process'

  // Master 1-second interval to tick waiting timers live
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch KOTs helper
  const loadKOTs = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const data = await fetchKots();
      setKots(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('Failed to load KOTs:', err);
      setError(err.message || 'Unable to connect to order server');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load + 5-second polling interval
  useEffect(() => {
    loadKOTs();
    const pollInterval = setInterval(() => {
      loadKOTs(true);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(pollInterval);
  }, [loadKOTs]);

  // Handle status update
  const handleStatusChange = async (id, newStatus) => {
    setUpdatingId(id);
    try {
      const updated = await updateKotStatus(id, newStatus);
      setKots((prev) =>
        prev.map((k) => (k.id === id ? { ...k, status: updated.status || newStatus } : k))
      );
    } catch (err) {
      alert(`Failed to update order status: ${err.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  // Sort: Oldest pending/in-process orders first (FIFO kitchen discipline)
  // Filters out 'Completed' orders from live kitchen queue
  const activeOrders = useMemo(() => {
    return kots
      .filter((k) => k.status !== STATUS.COMPLETED)
      .filter((k) => (filter === 'ALL' ? true : k.status === filter))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [kots, filter]);

  // Stats calculation
  const stats = useMemo(() => {
    const active = kots.filter((k) => k.status !== STATUS.COMPLETED);
    const pending = active.filter((k) => k.status === STATUS.PENDING).length;
    const inProcess = active.filter((k) => k.status === STATUS.IN_PROCESS).length;
    let criticalCount = 0;
    active.forEach((k) => {
      const sec = getElapsedSeconds(k.created_at, now);
      if (getWaitLevel(sec) === 'critical') criticalCount++;
    });
    return { total: active.length, pending, inProcess, criticalCount };
  }, [kots, now]);

  return (
    <div className="kot-app-container">
      {/* Top Header / Branding Bar */}
      <header className="kot-header">
        <div className="kot-branding">
          <div className="kot-logo-badge">
            <ChefHatIcon />
          </div>
          <div>
            <h1 className="kot-title">Kitchen Order Display (KOT)</h1>
            <p className="kot-subtitle">Live Kitchen Operations &amp; Order Fulfillment Queue</p>
          </div>
        </div>

        <div className="kot-header-actions">
          <div className="kot-last-updated">
            <span className="live-pulse" />
            <span>Updated: {formatRefreshTime(lastUpdated)}</span>
          </div>

          <button
            type="button"
            className="kot-btn kot-btn-refresh"
            onClick={() => loadKOTs()}
            disabled={refreshing}
            title="Manual refresh"
          >
            <RefreshIcon spinning={refreshing} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </header>

      {/* Metric Summary Cards */}
      <section className="kot-stats-grid">
        <div
          className={`stat-card ${filter === 'ALL' ? 'active' : ''}`}
          onClick={() => setFilter('ALL')}
          role="button"
          tabIndex={0}
        >
          <span className="stat-label">Active Orders</span>
          <span className="stat-value">{stats.total}</span>
          <span className="stat-footnote">In kitchen pipeline</span>
        </div>

        <div
          className={`stat-card stat-pending ${filter === STATUS.PENDING ? 'active' : ''}`}
          onClick={() => setFilter(STATUS.PENDING)}
          role="button"
          tabIndex={0}
        >
          <span className="stat-label">Pending</span>
          <span className="stat-value">{stats.pending}</span>
          <span className="stat-footnote">Awaiting preparation</span>
        </div>

        <div
          className={`stat-card stat-process ${filter === STATUS.IN_PROCESS ? 'active' : ''}`}
          onClick={() => setFilter(STATUS.IN_PROCESS)}
          role="button"
          tabIndex={0}
        >
          <span className="stat-label">In Process</span>
          <span className="stat-value">{stats.inProcess}</span>
          <span className="stat-footnote">Cooking on station</span>
        </div>

        <div className="stat-card stat-critical">
          <span className="stat-label">Delayed Orders (&gt;20m)</span>
          <span className="stat-value text-critical">{stats.criticalCount}</span>
          <span className="stat-footnote">Needs urgent attention</span>
        </div>
      </section>

      {/* Main Order Queue Table Card */}
      <main className="kot-main-card">
        <div className="kot-table-toolbar">
          <div className="toolbar-left">
            <h2 className="toolbar-title">Active Kitchen Tickets</h2>
            <span className="badge badge-sort">Oldest First (FIFO)</span>
            {filter !== 'ALL' && (
              <span className="badge badge-filter">Filter: {filter}</span>
            )}
          </div>

          <div className="toolbar-legend">
            <span className="legend-item">
              <span className="legend-indicator normal" />
              &lt; 10 min
            </span>
            <span className="legend-item">
              <span className="legend-indicator warn" />
              10–20 min (Warning)
            </span>
            <span className="legend-item">
              <span className="legend-indicator critical" />
              &gt; 20 min (Delayed / Critical)
            </span>
          </div>
        </div>

        {error && (
          <div className="kot-alert-banner">
            <AlertTriangleIcon />
            <span>{error}</span>
            <button type="button" className="btn-retry" onClick={() => loadKOTs()}>
              Retry
            </button>
          </div>
        )}

        <div className="table-responsive">
          <table className="kot-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>#</th>
                <th style={{ width: '130px' }}>KOT ID</th>
                <th style={{ minWidth: '240px' }}>Items &amp; Quantity</th>
                <th style={{ minWidth: '180px' }}>Order Note / Instruction</th>
                <th style={{ width: '110px' }}>Placed</th>
                <th style={{ width: '160px' }}>Waiting Time</th>
                <th style={{ width: '130px' }}>Status</th>
                <th style={{ width: '170px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && kots.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-state-cell">
                    <div className="loading-spinner" />
                    <p>Loading kitchen order queue...</p>
                  </td>
                </tr>
              ) : activeOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-state-cell empty-state">
                    <div className="empty-icon-wrap">
                      <CheckIcon />
                    </div>
                    <h3>Kitchen Queue is Clear!</h3>
                    <p>No {filter === 'ALL' ? 'pending or in-process' : filter.toLowerCase()} orders right now.</p>
                  </td>
                </tr>
              ) : (
                activeOrders.map((kot, index) => {
                  const elapsedSec = getElapsedSeconds(kot.created_at, now);
                  const waitLevel = getWaitLevel(elapsedSec);
                  const isUpdating = updatingId === kot.id;
                  const isInProcess = kot.status === STATUS.IN_PROCESS;
                  const note = kot.note || kot.instruction || kot.special_instruction || '';

                  return (
                    <tr
                      key={kot.id}
                      className={`kot-row row-${waitLevel} ${isInProcess ? 'is-in-process' : ''}`}
                    >
                      {/* # Serial */}
                      <td className="cell-serial">{index + 1}</td>

                      {/* KOT ID */}
                      <td className="cell-kot-id">
                        <span className="kot-id-tag">{kot.kot_id || `KOT-${kot.id}`}</span>
                      </td>

                      {/* Items */}
                      <td className="cell-items">
                        <ul className="items-list">
                          {Array.isArray(kot.items) && kot.items.length > 0 ? (
                            kot.items.map((item, i) => (
                              <li key={i} className="item-row">
                                <span className="item-qty">{item.quantity}×</span>
                                <span className="item-name">{item.item_name || item.name}</span>
                              </li>
                            ))
                          ) : (
                            <span className="text-muted">No items</span>
                          )}
                        </ul>
                      </td>

                      {/* Note / Special Instruction Column */}
                      <td className="cell-note">
                        {note ? (
                          <div className="note-card">
                            <NoteIcon />
                            <span>{note}</span>
                          </div>
                        ) : (
                          <span className="no-note">—</span>
                        )}
                      </td>

                      {/* Placed Time */}
                      <td className="cell-placed">
                        <span className="time-val">{formatOrderTime(kot.created_at)}</span>
                      </td>

                      {/* Waiting Time with Severity Color Badge */}
                      <td className="cell-wait">
                        <div className={`wait-badge badge-${waitLevel}`}>
                          <ClockIcon />
                          <span className="wait-duration">{formatDuration(elapsedSec)}</span>
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="cell-status">
                        <span className={`status-pill pill-${kot.status.toLowerCase().replace(/\s+/g, '-')}`}>
                          {kot.status}
                        </span>
                      </td>

                      {/* Professional Action Buttons with Clean Icons */}
                      <td className="cell-actions">
                        <div className="action-button-group">
                          {/* In Process button */}
                          <button
                            type="button"
                            className="btn-action btn-process"
                            disabled={isUpdating || isInProcess}
                            onClick={() => handleStatusChange(kot.id, STATUS.IN_PROCESS)}
                            title={isInProcess ? 'Already in process' : 'Start preparation (In Process)'}
                            aria-label={`Mark ${kot.kot_id} in process`}
                          >
                            <PlayIcon />
                            <span className="btn-label">Start</span>
                          </button>

                          {/* Completed button */}
                          <button
                            type="button"
                            className="btn-action btn-complete"
                            disabled={isUpdating}
                            onClick={() => handleStatusChange(kot.id, STATUS.COMPLETED)}
                            title="Mark completed"
                            aria-label={`Mark ${kot.kot_id} completed`}
                          >
                            <CheckIcon />
                            <span className="btn-label">Done</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}