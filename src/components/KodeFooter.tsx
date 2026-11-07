import React from "react";

export function KodeFooter() {
  return (
    <footer className="py-8 text-center text-xs text-[var(--text-muted)] select-none">
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--border-color)] bg-[var(--bg-surface)]">
        <span className="opacity-70">created by</span>
        <span className="font-mono font-semibold tracking-wider text-[var(--text-primary)] inline-flex items-center">
          kode
          <span
            aria-hidden="true"
            className="inline-block w-1.5 h-3.5 ml-0.5 bg-[var(--accent)] animate-pulse"
          />
        </span>
      </span>
    </footer>
  );
}

