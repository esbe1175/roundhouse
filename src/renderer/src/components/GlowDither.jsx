import { useEffect, useState } from "react";

let noiseTexture;
function getNoiseTexture() {
  if (noiseTexture) return noiseTexture;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  const pixels = context.createImageData(128, 128);
  let seed = 0x6d2b79f5;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const value = seed >>> 24;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
    pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  noiseTexture = canvas.toDataURL();
  return noiseTexture;
}

export default function GlowDither({ id }) {
  const [ratio, setRatio] = useState(window.devicePixelRatio || 1);
  useEffect(() => {
    const query = window.matchMedia(`(resolution: ${ratio}dppx)`);
    const update = () => setRatio(window.devicePixelRatio || 1);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [ratio]);
  return (
    <svg className="rh-ambient-filter" aria-hidden="true" width="0" height="0">
      <defs>
        <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feImage href={getNoiseTexture()} x="0" y="0" width={128 / ratio} height={128 / ratio} result="tile" />
          <feTile in="tile" result="noise" />
          {/* Apply signed, one-level noise AFTER the glow's mask and intensity.
              The opaque black backing keeps arithmetic alpha clamped to one.
              The texture is made once; there is no animated noise generation. */}
          <feComposite in="SourceGraphic" in2="noise" operator="arithmetic" k1="0" k2="1" k3={2 / 255} k4={-1 / 255} />
        </filter>
      </defs>
    </svg>
  );
}
