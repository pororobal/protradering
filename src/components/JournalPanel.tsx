import { useState } from "react";
import { formatTime } from "../utils/format";

interface Props {
  journal: {
    entries: { symbol: string; note: string; updatedAt: string }[];
    save: (symbol: string, note: string) => void;
    remove: (symbol: string) => void;
    get: (symbol: string) => { note: string } | undefined;
  };
}

export function JournalPanel({ journal }: Props) {
  const [symbol, setSymbol] = useState("");
  const [note, setNote] = useState("");

  const handleSave = () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym || !note.trim()) return;
    journal.save(sym, note.trim());
    setSymbol("");
    setNote("");
  };

  return (
    <section>
      <div className="panel-header">
        <h2>Trading Journal</h2>
        <p>종목별 메모 · LocalStorage</p>
      </div>
      <div className="journal-form">
        <input
          placeholder="티커 (AAPL)"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
        />
        <textarea
          placeholder="진입 근거, 손절, 메모..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
        <button className="btn primary" onClick={handleSave}>
          저장
        </button>
      </div>
      <div className="list-panel">
        {journal.entries.map((e) => (
          <div key={e.symbol} className="journal-row">
            <div className="journal-head">
              <strong>{e.symbol}</strong>
              <span className="muted">{formatTime(e.updatedAt)}</span>
              <button className="btn tiny" onClick={() => journal.remove(e.symbol)}>
                삭제
              </button>
            </div>
            <p>{e.note}</p>
          </div>
        ))}
        {!journal.entries.length && <div className="empty">저장된 메모가 없습니다.</div>}
      </div>
    </section>
  );
}
