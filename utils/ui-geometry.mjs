export function popupBounds(point, area, size = { width: 600, height: 600 }) {
  const width = Math.min(size.width, area.width),
    height = Math.min(size.height, area.height);
  return {
    width,
    height,
    x: Math.round(Math.max(area.x, Math.min(point.x - 150, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(point.y - 100, area.y + area.height - height))),
  };
}

export function tooltipBounds(point, size, area) {
  const width = Math.min(size.width, Math.max(0, area.width - 16));
  const height = Math.min(size.height, Math.max(0, area.height - 16));
  return {
    left: Math.max(area.x + 8, Math.min(point.x + 15, area.x + area.width - width - 8)),
    top: Math.max(
      area.y + 8,
      Math.min(
        point.y + 15 + height <= area.y + area.height - 8 ? point.y + 15 : point.y - height - 15,
        area.y + area.height - height - 8,
      ),
    ),
  };
}
