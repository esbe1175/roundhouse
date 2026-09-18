import { useEffect, useId, useMemo, useRef } from "react";
import { GLOW_MORPH_MS, glowOpacity } from "../../../../utils/ambient-glow.mjs";
import GlowDither from "./GlowDither";

export default function AmbientGlow({ colors, intensity, falloff, frame, width, height }) {
  const ditherId = `glow-dither-${useId().replaceAll(":", "")}`;
  // Player IPC repeats the palette alongside unrelated state changes. Only a
  // changed color field should start a new morph, not hover/volume updates.
  const palette = JSON.stringify(colors);
  const base = useRef(null),
    target = useRef(null),
    initialized = useRef(false);
  useEffect(() => {
    if (!palette || !base.current || !target.current) return;
    const previous = base.current.getContext("2d");
    const next = target.current.getContext("2d");
    // Preserve the current blend if a sample arrives early. The base stays
    // opaque throughout: only the next color field's contribution changes.
    if (initialized.current) {
      previous.globalAlpha = Number(getComputedStyle(target.current).opacity);
      previous.drawImage(target.current, 0, 0);
      previous.globalAlpha = 1;
    }
    target.current.getAnimations().forEach((animation) => animation.cancel());
    const small = document.createElement("canvas");
    small.width = 6;
    small.height = 4;
    const input = small.getContext("2d");
    JSON.parse(palette).forEach(([r, g, b], i) => {
      input.fillStyle = `rgb(${r},${g},${b})`;
      input.fillRect(i % 6, Math.floor(i / 6), 1, 1);
    });
    next.clearRect(0, 0, 96, 64);
    next.filter = "blur(10px)";
    next.drawImage(small, -40, -28, 176, 120);
    if (!initialized.current) {
      previous.drawImage(target.current, 0, 0);
      initialized.current = true;
    }
    target.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: GLOW_MORPH_MS, fill: "forwards" });
    // Chromium composites two tiny textures; no JS animation/frame loop.
  }, [palette]);
  useEffect(() => {
    const canvas = target.current;
    return () => canvas?.getAnimations().forEach((animation) => animation.cancel());
  }, []);
  const mask = useMemo(() => {
    if (!falloff || !frame || !width || !height) return "none";
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 64;
    const context = canvas.getContext("2d"),
      data = context.createImageData(96, 64);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 96; x++) {
        data.data[(y * 96 + x) * 4 + 3] = Math.round(
          255 * glowOpacity((x + 0.5) / 96, (y + 0.5) / 64, frame, width / height, falloff),
        );
      }
    context.putImageData(data, 0, 0);
    return `url("${canvas.toDataURL()}")`;
  }, [falloff, frame?.left, frame?.right, frame?.top, frame?.bottom, width, height]);
  return (
    <>
      <GlowDither id={ditherId} />
      <div
        className="rh-ambient-output"
        aria-hidden="true"
        style={{ filter: intensity > 0 ? `url(#${ditherId})` : "none" }}
      >
        <div
          className="rh-ambient"
          aria-hidden="true"
          style={{ opacity: intensity / 100, maskImage: mask, maskSize: "100% 100%" }}
        >
          <canvas ref={base} width={96} height={64} />
          <canvas ref={target} width={96} height={64} />
        </div>
      </div>
    </>
  );
}
