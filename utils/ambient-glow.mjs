export const GLOW_MORPH_MS = 2600;

// Distances are fractions of the picture's shorter side, never screen pixels.
// A Gaussian tail has no finite cutoff and rounds naturally around corners.
export function glowOpacity(x, y, frame, aspect, falloff) {
  if (!falloff || !frame) return 1;
  const unit = Math.min((frame.right - frame.left) * aspect, frame.bottom - frame.top);
  if (unit <= 0) return 1;
  const dx = (Math.max(frame.left - x, 0, x - frame.right) * aspect) / unit;
  const dy = Math.max(frame.top - y, 0, y - frame.bottom) / unit;
  const spread = 0.025 + 0.8 * (1 - falloff / 100) ** 2;
  return Math.exp(-(dx * dx + dy * dy) / (2 * spread * spread));
}
