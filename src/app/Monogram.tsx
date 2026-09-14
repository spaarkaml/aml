/**
 * AML's monogram: the stencil A, M and L with rounded corners, the same shapes as the app icon
 * (drawn by `scripts/icons.mjs`, which is where they come from).
 *
 * Filled with `currentColor`, so wherever it sits it takes that place's colour — in the top bar,
 * the app's own accent, which follows Paper, Ink and anything set in Appearance (ADR-013). The
 * icon's fixed light blue belongs to the icon files only.
 */
export function Monogram({ height = 16, className }: { height?: number; className?: string }) {
  // Cropped to the letters themselves, so `height` is the height of the drawing, not of padding.
  return (
    <svg
      className={className}
      height={height}
      width={Math.round((height * 942) / 803)}
      viewBox="37 98 942 803"
      fill="currentColor"
      role="img"
      aria-label="AML"
    >
      <path d="M261.3,108.0 L306.1,108.0 Q325.0,108.0 332.0,125.6 L389.6,269.1 Q404.0,305.0 365.3,305.0 L337.6,305.0 Q318.0,305.0 311.3,286.6 L299.3,253.8 Q284.0,212.0 269.0,254.0 L223.4,381.7 Q218.0,397.0 234.2,397.0 L237.8,397.0 Q254.0,397.0 254.0,413.2 L254.0,441.0 Q254.0,469.0 226.0,469.0 L209.7,469.0 Q190.0,469.0 183.4,487.6 L143.6,598.4 Q137.0,617.0 117.3,617.0 L87.5,617.0 Q47.0,617.0 61.5,579.2 L235.1,126.0 Q242.0,108.0 261.3,108.0Z" />
      <path d="M305.0,328.0 L397.1,328.0 Q416.0,328.0 423.0,345.6 L490.8,514.7 Q515.0,575.0 542.2,516.0 L621.5,344.3 Q629.0,328.0 646.9,328.0 L673.0,328.0 Q709.0,328.0 693.7,360.6 L538.6,691.9 Q531.0,708.0 513.2,708.0 L496.2,708.0 Q479.0,708.0 471.2,692.6 L407.6,566.4 Q359.0,470.0 359.0,578.0 L359.0,682.0 Q359.0,710.0 331.0,710.0 L305.0,710.0 Q277.0,710.0 277.0,682.0 L277.0,356.0 Q277.0,328.0 305.0,328.0Z" />
      <path d="M737.0,419.8 L737.0,784.0 Q737.0,812.0 765.0,812.0 L941.0,812.0 Q969.0,812.0 969.0,840.0 L969.0,863.0 Q969.0,891.0 941.0,891.0 L679.0,891.0 Q651.0,891.0 651.0,863.0 L651.0,519.2 Q651.0,513.0 653.6,507.4 L698.3,411.3 Q737.0,328.0 737.0,419.8Z" />
    </svg>
  );
}
