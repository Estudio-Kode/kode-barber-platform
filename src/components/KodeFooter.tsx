import React from "react";

export function KodeFooter() {
  return (
    <footer className="py-8 text-center text-xs text-[var(--text-muted)] select-none">
      <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[var(--border-color)] bg-[var(--bg-surface)] shadow-xs">
        <span className="opacity-70 text-[11px] font-medium tracking-wide">created by</span>
        <span className="inline-flex items-center">
          {/* Logo Kode - Tema Escuro */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/kode-logo-dark.png"
            alt="Kode"
            width={51}
            height={20}
            className="kode-logo-dark h-[18px] w-auto rounded-sm object-contain align-middle"
          />
          {/* Logo Kode - Tema Claro */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/kode-logo-light.png"
            alt="Kode"
            width={51}
            height={20}
            className="kode-logo-light h-[18px] w-auto rounded-sm object-contain align-middle"
          />
        </span>
      </span>
    </footer>
  );
}
