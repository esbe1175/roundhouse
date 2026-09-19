export const STV_ZERO_WIDTH_FLAG = 1 << 8;

export function isZeroWidthEmote(flags) {
  return (Number(flags) & STV_ZERO_WIDTH_FLAG) !== 0;
}

export function emoteDisplaySize(width, height, naturalWidth, naturalHeight, scale = 1) {
  const metadataWidth = Number(width);
  const metadataHeight = Number(height);
  const loadedWidth = Number(naturalWidth);
  const loadedHeight = Number(naturalHeight);
  const ratio =
    loadedWidth > 0 && loadedHeight > 0
      ? loadedWidth / loadedHeight
      : metadataWidth > 0 && metadataHeight > 0
        ? metadataWidth / metadataHeight
        : 1;
  const displayHeight = 32 * Math.max(0.5, Math.min(Number(scale) || 1, 4));
  return {
    width: Math.max(1, Math.min(displayHeight * ratio, displayHeight * 8)),
    height: displayHeight,
  };
}
