import { useEffect, useState } from "react";
import licenseText from "../../../../LICENSE?raw";
import noticesText from "../../../../THIRD_PARTY_NOTICES.md?raw";
import mpvCopyright from "../../../../resources/licenses/mpv-Copyright.txt?raw";
import mpvGpl from "../../../../resources/licenses/mpv-GPL-2.0.txt?raw";
import mpvLgpl from "../../../../resources/licenses/mpv-LGPL-2.1.txt?raw";
import ffmpegLicense from "../../../../resources/licenses/FFmpeg-LICENSE.txt?raw";
import ffmpegGpl from "../../../../resources/licenses/FFmpeg-GPL-3.0.txt?raw";
import interLicense from "../../../../resources/licenses/Inter-OFL-1.1.txt?raw";
import phosphorLicense from "../../../../resources/licenses/Phosphor-MIT.txt?raw";
import radixLicense from "../../../../resources/licenses/Radix-MIT.txt?raw";
import PlaybackIcon from "./PlaybackIcon";

const sections = [
  { id: "credits", label: "Credits & notices", text: noticesText },
  { id: "license", label: "Roundhouse license", text: licenseText },
  {
    id: "third-party",
    label: "Third-party licenses",
    text: [
      "MPV COPYRIGHT AND LICENSE INFORMATION\n",
      mpvCopyright,
      "\n\nMPV — GNU GPL 2.0\n",
      mpvGpl,
      "\n\nMPV — GNU LGPL 2.1\n",
      mpvLgpl,
      "\n\nFFMPEG LICENSE STATEMENT\n",
      ffmpegLicense,
      "\n\nFFMPEG — GNU GPL 3.0\n",
      ffmpegGpl,
      "\n\nINTER FONT — SIL OPEN FONT LICENSE 1.1\n",
      interLicense,
      "\n\nPHOSPHOR ICONS — MIT LICENSE\n",
      phosphorLicense,
      "\n\nRADIX UI — MIT LICENSE\n",
      radixLicense,
    ].join(""),
  },
];

export default function LegalDialog({ open, onClose }) {
  const [section, setSection] = useState("credits");
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, onClose]);
  if (!open) return null;
  const active = sections.find((item) => item.id === section) || sections[0];
  return (
    <div className="rh-legal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="rh-legal-dialog" role="dialog" aria-modal="true" aria-labelledby="rh-legal-title">
        <header>
          <div>
            <h2 id="rh-legal-title">About Roundhouse</h2>
            <p>Credits, copyright notices, and software licenses</p>
          </div>
          <button className="rh-icon-control" aria-label="Close About Roundhouse" onClick={onClose} autoFocus>
            <PlaybackIcon kind="close" />
          </button>
        </header>
        <div className="rh-legal-body">
          <nav aria-label="Legal information">
            {sections.map((item) => (
              <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}>
                {item.label}
              </button>
            ))}
          </nav>
          <article>
            <h3>{active.label}</h3>
            <pre>{active.text}</pre>
          </article>
        </div>
      </section>
    </div>
  );
}
