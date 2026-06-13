import { useEffect, useRef } from "react";

declare global {
  interface Window {
    TradingView?: {
      widget: new (opts: Record<string, unknown>) => void;
    };
  }
}

interface Props {
  symbol: string;
}

export function TradingViewChart({ symbol }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const containerId = `tv_${symbol.replace(/[^A-Z0-9]/gi, "")}`;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = "";

    const init = () => {
      if (!window.TradingView || !containerRef.current) return;
      new window.TradingView.widget({
        autosize: true,
        symbol: symbol,
        interval: "D",
        timezone: "America/New_York",
        theme: "dark",
        style: "1",
        locale: "en",
        toolbar_bg: "#0a0e14",
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_legend: false,
        container_id: containerId,
      });
    };

    if (window.TradingView) {
      init();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = init;
    document.head.appendChild(script);

    return () => {
      if (el) el.innerHTML = "";
    };
  }, [symbol, containerId]);

  return <div id={containerId} ref={containerRef} className="tv-chart" />;
}
