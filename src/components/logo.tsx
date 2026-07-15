export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 256 256"
      className={className}
      role="img"
      aria-label="ZimaOS Stats logo"
    >
      <defs>
        <linearGradient id="zs-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#232322" />
          <stop offset="1" stopColor="#141413" />
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="58" fill="url(#zs-logo-bg)" />
      <rect
        x="4"
        y="4"
        width="248"
        height="248"
        rx="54"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.07"
        strokeWidth="4"
      />
      <g fill="#4ad484" opacity="0.22">
        <rect x="52" y="150" width="18" height="54" rx="6" />
        <rect x="82" y="128" width="18" height="76" rx="6" />
        <rect x="112" y="158" width="18" height="46" rx="6" />
        <rect x="142" y="112" width="18" height="92" rx="6" />
        <rect x="172" y="138" width="18" height="66" rx="6" />
      </g>
      <path
        d="M40 132 L86 132 L104 86 L128 168 L148 108 L162 132 L216 132"
        fill="none"
        stroke="#4ad484"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
