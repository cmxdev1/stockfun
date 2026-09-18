export function LodeMark({ size = 30, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="lode-a" x1="8" y1="4" x2="40" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFE9A8" />
          <stop offset="0.45" stopColor="#FFC44D" />
          <stop offset="1" stopColor="#C98A18" />
        </linearGradient>
        <linearGradient id="lode-b" x1="24" y1="6" x2="24" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8FF9FF" />
          <stop offset="1" stopColor="#4B6BFF" />
        </linearGradient>
      </defs>
      {/* Iso tile base */}
      <path d="M24 30 6 39.5 24 49 42 39.5 24 30Z" fill="url(#lode-b)" opacity="0.32" />
      <path d="M24 26 6 35.5 24 45 42 35.5 24 26Z" fill="#0B1022" stroke="#1F2A50" />
      {/* Gem */}
      <path d="M24 3 37 15.5 24 37 11 15.5 24 3Z" fill="url(#lode-a)" />
      <path d="M24 3 37 15.5 24 18.5 11 15.5 24 3Z" fill="#FFF6DA" opacity="0.72" />
      <path d="M24 18.5 37 15.5 24 37 24 18.5Z" fill="#8F5F09" opacity="0.4" />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`display text-[17px] tracking-[-0.02em] ${className}`}>
      STOCK<span className="gold-text">FUN</span>
    </span>
  );
}
