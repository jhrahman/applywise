export function AnimatedCheckmark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="var(--color-accent-2)"
        strokeWidth="2"
        strokeLinecap="round"
        style={{
          strokeDasharray: 57,
          strokeDashoffset: 57,
          animation: "draw-circle 0.5s ease forwards",
        }}
      />
      <path
        d="M7 12.5L10.5 16L17 8"
        stroke="var(--color-accent-1)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 16,
          strokeDashoffset: 16,
          animation: "draw-check 0.35s ease 0.45s forwards",
        }}
      />
    </svg>
  );
}
