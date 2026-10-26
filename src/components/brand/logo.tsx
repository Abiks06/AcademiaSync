/** Two interlocking open brackets: two authors, one citation. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="as-logo" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0" stopColor="var(--iris)" />
          <stop offset="1" stopColor="var(--teal)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#as-logo)" />
      <path d="M13 9h-3v14h3" stroke="var(--bg)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 9h3v14h-3" stroke="var(--bg)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="16" r="2.2" fill="var(--bg)" />
    </svg>
  );
}
