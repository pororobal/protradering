import { formatTime } from "../utils/format";

interface Props {
  watchlist: {
    items: { symbol: string; name: string; addedAt: string; source: string }[];
    remove: (s: string) => void;
  };
}

export function WatchlistPanel({ watchlist }: Props) {
  if (!watchlist.items.length) {
    return <div className="empty">관심종목이 없습니다. 스크리너에서 ☆를 눌러 추가하세요.</div>;
  }

  return (
    <section>
      <div className="panel-header">
        <h2>Watchlist</h2>
        <p>LocalStorage 저장 · {watchlist.items.length}종목</p>
      </div>
      <div className="list-panel">
        {watchlist.items.map((item) => (
          <div key={item.symbol} className="list-row">
            <div>
              <strong>{item.symbol}</strong>
              <span className="muted"> {item.name}</span>
            </div>
            <div className="list-meta">
              <span className="tag">{item.source}</span>
              <span className="muted">{formatTime(item.addedAt)}</span>
              <button className="btn tiny" onClick={() => watchlist.remove(item.symbol)}>
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
