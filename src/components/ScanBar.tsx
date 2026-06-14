import { formatTime } from "../utils/format";

interface Props {
  loading: boolean;
  error: string | null;
  progress: string;
  timestamp?: string;
  scannedCount?: number;
  cached?: boolean;
  onScan: () => void;
  onRefresh: () => void;
}

export function ScanBar({
  loading,
  error,
  progress,
  timestamp,
  scannedCount,
  cached,
  onScan,
  onRefresh,
}: Props) {
  return (
    <div className="scan-bar">
      <div className="scan-actions">
        <button className="btn primary" onClick={onScan} disabled={loading}>
          {loading ? "스캔 중..." : "스캔"}
        </button>
        <button className="btn ghost" onClick={onRefresh} disabled={loading}>
          강제 갱신
        </button>
      </div>
      <div className="scan-meta">
        {loading && (
          <div className="scan-progress">
            <div className="progress-bar">
              <div className="progress-fill" />
            </div>
            <span className="progress-text">{progress}</span>
          </div>
        )}
        {error && <span className="error">{error}</span>}
        {!loading && timestamp && (
          <span>
            {formatTime(timestamp)}
            {scannedCount != null && ` · ${scannedCount}종목`}
            {cached && " · 캐시"}
          </span>
        )}
      </div>
    </div>
  );
}
