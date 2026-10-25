"use client";

import { useCallback, useState } from "react";

export interface LogLine {
  t: string;
  msg: string;
  err?: boolean;
}

export function useLog() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const log = useCallback((msg: string, err = false) => {
    const t = new Date().toLocaleTimeString("fr-FR", { hour12: false });
    setLines((l) => [...l, { t, msg, err }]);
  }, []);
  return { lines, log };
}

export function Terminal({ lines, empty }: { lines: LogLine[]; empty: string }) {
  return (
    <div className="terminal" role="log" aria-live="polite">
      {lines.length === 0 ? (
        <div>{empty}</div>
      ) : (
        lines.map((l, i) => (
          <div key={i} className={l.err ? "err" : undefined}>
            <span className="t">{l.t}</span>
            {l.msg}
          </div>
        ))
      )}
    </div>
  );
}
