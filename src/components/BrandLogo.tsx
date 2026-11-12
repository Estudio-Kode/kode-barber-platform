import React from "react";

export function BrandLogo({ className = "h-10 w-auto" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 640 170"
      role="img"
      aria-label="Kode Barber"
      className={className}
    >
      <g fill="currentColor" stroke="currentColor">
        <text
          x="320"
          y="74"
          textAnchor="middle"
          fontFamily="var(--font-geist-sans), 'Helvetica Neue', 'Segoe UI', Arial, sans-serif"
          fontSize="68"
          fontWeight="300"
          letterSpacing="16"
          stroke="none"
        >
          KODE BARBER
        </text>

        {/* Linhas divisórias em destaque âmbar */}
        <line
          x1="92"
          y1="120"
          x2="286"
          y2="120"
          stroke="var(--accent)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <line
          x1="354"
          y1="120"
          x2="548"
          y2="120"
          stroke="var(--accent)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />

        {/* Tesoura cruzada */}
        <g fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round">
          <line x1="312" y1="132" x2="333" y2="101" />
          <line x1="328" y1="132" x2="307" y2="101" />
          <circle cx="310" cy="135" r="5.4" />
          <circle cx="330" cy="135" r="5.4" />
        </g>
      </g>
    </svg>
  );
}

