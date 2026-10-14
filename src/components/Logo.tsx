export function Logo({ size = 24, withText = false, light = false }: { size?: number; withText?: boolean; light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="7" fill={light ? "rgba(255,255,255,.25)" : "#2d7ff9"} />
        <g fill="#fff">
          <rect x="7" y="7" width="8" height="8" rx="1.5" />
          <rect x="17" y="7" width="8" height="8" rx="1.5" opacity=".8" />
          <rect x="7" y="17" width="8" height="8" rx="1.5" opacity=".8" />
          <rect x="17" y="17" width="8" height="8" rx="1.5" opacity=".6" />
        </g>
      </svg>
      {withText && <span className={`text-lg font-semibold tracking-tight ${light ? "text-white" : ""}`}>EightGrid</span>}
    </span>
  );
}
