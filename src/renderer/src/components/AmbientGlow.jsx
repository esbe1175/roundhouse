import { useEffect, useRef } from "react";

// Upscale only a tiny, pre-blurred canvas. No full-resolution image is sent to
// Chromium and no animation/frame callback runs between three-second samples.
export default function AmbientGlow({ colors, intensity, falloff, frame, width, height }) {
  const canvas = useRef(null);
  useEffect(() => {
    if (!colors || !canvas.current) return;
    const small = document.createElement("canvas");
    small.width = 6;
    small.height = 4;
    const input = small.getContext("2d");
    colors.forEach(([r, g, b], i) => {
      input.fillStyle = `rgb(${r},${g},${b})`;
      input.fillRect(i % 6, Math.floor(i / 6), 1, 1);
    });
    const context = canvas.current.getContext("2d");
    context.clearRect(0, 0, 96, 64);
    context.filter = "blur(10px)";
    context.drawImage(small, -20, -14, 136, 92);
  }, [colors]);
  const reach = Math.max(24, Math.min(width || 800, height || 600) * 2 * (1 - falloff / 105) ** 2);
  const mask =
    falloff > 0 && frame
      ? `linear-gradient(to right, transparent calc(${frame.left * 100}% - ${reach}px), black ${frame.left * 100}%, black ${frame.right * 100}%, transparent calc(${frame.right * 100}% + ${reach}px)), linear-gradient(to bottom, transparent calc(${frame.top * 100}% - ${reach}px), black ${frame.top * 100}%, black ${frame.bottom * 100}%, transparent calc(${frame.bottom * 100}% + ${reach}px))`
      : "none";
  return (
    <canvas
      ref={canvas}
      width={96}
      height={64}
      className="rh-ambient"
      aria-hidden="true"
      style={{ opacity: intensity / 100, maskImage: mask, maskComposite: "intersect" }}
    />
  );
}
