"""Generate Roundhouse branding from the original bitmap. Requires Pillow."""

from pathlib import Path
import struct

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "resources" / "icons"
SIZES = (16, 20, 24, 32, 40, 48, 64, 128, 256)
GREEN = (83, 252, 24, 255)

source = Image.open(ROOT / "Roundhouse.bmp").convert("RGB")
assert source.size == (8, 9), "Expected the original 8 x 9 bitmap"
assert set(source.getdata()) <= {(0, 0, 0), (255, 255, 255)}, "Expected black and white pixels"
mark = Image.new("RGBA", source.size)
mark.putdata([GREEN if pixel == (0, 0, 0) else (0, 0, 0, 0) for pixel in source.getdata()])
master = Image.new("RGBA", (256, 256))
master.paste(mark.resize((192, 216), Image.Resampling.NEAREST), (32, 20))
DEST.mkdir(parents=True, exist_ok=True)
(DEST / "win").mkdir(exist_ok=True)
master.save(DEST / "Roundhouse.png")

# Derive every size directly from the master, without per-size pixel adjustments.
# Assemble PNG-backed ICO entries explicitly to avoid the ICO writer resampling.
entries = []
for size in SIZES:
    resized = master if size == 256 else master.resize((size, size), Image.Resampling.LANCZOS)
    target = DEST / f"Roundhouse-{size}.png"
    resized.save(target)
    entries.append((size, target.read_bytes()))

offset = 6 + 16 * len(entries)
directory = bytearray(struct.pack("<HHH", 0, 1, len(entries)))
for size, data in entries:
    directory.extend(struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(data), offset))
    offset += len(data)
(DEST / "win" / "Roundhouse.ico").write_bytes(directory + b"".join(data for _, data in entries))
print("Generated 256px master, nine PNG sizes and Windows ICO.")
