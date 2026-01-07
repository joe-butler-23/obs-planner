import * as React from "react";
import { LedgerEntry } from "../../services/LedgerStore";
import { HealthSnapshot } from "../../services/HealthService";

interface CookingHealthProps {
  snapshot: HealthSnapshot;
  todoistEntries: LedgerEntry[];
  onRefresh: () => void;
  onScan: () => void;
  onClear: () => void;
}

const formatTimestamp = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export const CookingHealth: React.FC<CookingHealthProps> = ({
  snapshot,
  todoistEntries,
  onRefresh,
  onScan,
  onClear
}) => {
  const handleClear = () => {
    if (confirm("Are you sure you want to clear the activity log?")) {
      onClear();
    }
  };

  return (
    <div className="cooking-health">
      <div className="cooking-health__header">
        <h2>Cooking Health</h2>
        <div className="cooking-health__controls">
          <button onClick={onRefresh}>Refresh</button>
          <button onClick={onScan}>Scan inbox now</button>
          <button className="mod-warning" onClick={handleClear}>
            Clear log
          </button>
        </div>
      </div>

      <div className="cooking-health__summary">
        <div className="cooking-health__metric">
          <div className="cooking-health__metric-label">Pending</div>
          <div className="cooking-health__metric-value">{snapshot.inboxPending}</div>
        </div>
        <div className="cooking-health__metric">
          <div className="cooking-health__metric-label">Archive</div>
          <div className="cooking-health__metric-value">{snapshot.archiveTotal}</div>
        </div>
        <div className="cooking-health__metric">
          <div className="cooking-health__metric-label">Errors</div>
          <div className="cooking-health__metric-value">{snapshot.errorTotal}</div>
        </div>
        <div className="cooking-health__metric">
          <div className="cooking-health__metric-label">Last processed</div>
          <div className="cooking-health__metric-value">
            {formatTimestamp(snapshot.lastProcessedAt)}
          </div>
        </div>
      </div>

      <div className="cooking-health__ledger-summary">
        Ledger: {snapshot.ledgerCounts.success} success, {snapshot.ledgerCounts.error} error,{" "}
        {snapshot.ledgerCounts.skipped} skipped
      </div>

      <div className="cooking-health__ledger">
        <h3>Recent activity</h3>
        {snapshot.recentEntries.length === 0 ? (
          <div className="cooking-health__empty">No recent activity.</div>
        ) : (
          <div className="cooking-health__ledger-list">
            {snapshot.recentEntries.map((entry) => (
              <div
                key={entry.key}
                className={`cooking-health__ledger-row cooking-health__ledger-row--${entry.status}`}
              >
                <div className="cooking-health__ledger-status">{entry.status}</div>
                <div className="cooking-health__ledger-detail">
                  {entry.detail ?? entry.key}
                </div>
                <div className="cooking-health__ledger-time">
                  {formatTimestamp(entry.processedAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="cooking-health__todoist">
        <h3>Todoist activity</h3>
        {todoistEntries.length === 0 ? (
          <div className="cooking-health__empty">No Todoist activity yet.</div>
        ) : (
          <div className="cooking-health__ledger-list">
            {todoistEntries.map((entry) => (
              <div
                key={entry.key}
                className={`cooking-health__ledger-row cooking-health__ledger-row--${entry.status}`}
              >
                <div className="cooking-health__ledger-status">{entry.status}</div>
                <div className="cooking-health__ledger-detail">
                  {entry.detail ?? entry.key}
                </div>
                <div className="cooking-health__ledger-time">
                  {formatTimestamp(entry.processedAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
