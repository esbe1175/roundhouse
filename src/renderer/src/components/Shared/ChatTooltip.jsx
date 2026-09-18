import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { tooltipBounds } from "../../../../../utils/ui-geometry.mjs";

// Portal out of the scrolling message list, but stay inside the chat's bounds:
// Chromium tooltips cannot cover mpv's native child window.
export default function ChatTooltip({ mousePos, className, children }) {
  const ref = useRef(null);
  const [style, setStyle] = useState({ visibility: "hidden" });
  useLayoutEffect(() => {
    const update = () => {
      const pane = document.querySelector(".rh-chat");
      const area = pane?.getBoundingClientRect() || { x: 0, y: 0, width: innerWidth, height: innerHeight };
      const el = ref.current;
      if (!el) return;
      el.style.maxWidth = `${Math.min(250, area.width - 16)}px`;
      el.style.minWidth = `${Math.min(132, area.width - 16)}px`;
      setStyle({
        ...tooltipBounds(mousePos, el.getBoundingClientRect(), area),
        visibility: "visible",
        maxWidth: Math.min(250, area.width - 16),
        maxHeight: area.height - 16,
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(ref.current);
    const pane = document.querySelector(".rh-chat");
    if (pane) observer.observe(pane);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [mousePos.x, mousePos.y]);
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className={className}
      style={{
        ...style,
        position: "fixed",
        display: "flex",
        opacity: 1,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 9999,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
