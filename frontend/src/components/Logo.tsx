interface LogoProps {
  size?: number
  className?: string
}

/** ProfitPulse's mark — a geometric "P": a stem plus a bowl with one rounded
 *  outer corner and a rectangular counter, built entirely from straight
 *  edges and a single arc. Deliberately not a tag, chart, coin, or
 *  checkmark — an abstract mark that happens to read as the initial.
 *
 *  Colors come from the app's --brand / --good tokens rather than a
 *  hardcoded palette, so the mark tracks every theme change (light/dark,
 *  any future retint) automatically instead of needing its own upkeep. */
export default function Logo({ size = 32, className }: LogoProps) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden="true">
      <rect x="18" y="12" width="20" height="76" fill="var(--brand)" />
      <path
        fillRule="evenodd"
        d="M34,12 H55 A25,25 0 0 1 55,62 H34 Z M38,25 H62 A5,5 0 0 1 62,35 H38 Z"
        fill="var(--good)"
      />
    </svg>
  )
}
