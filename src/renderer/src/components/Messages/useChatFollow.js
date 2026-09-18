import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import useChatStore from "../../providers/ChatProvider";

// Following is user intent, not a side effect of changing virtual row heights.
export default function useChatFollow(chatroomId, messages, virtuosoRef) {
  const [paused, setPaused] = useState(false);
  const [scroller, setScroller] = useState(null);
  const following = useRef(true);
  const frame = useRef(null);
  const changeFollowing = useCallback(
    (value) => {
      if (following.current === value) return;
      following.current = value;
      setPaused(!value);
      useChatStore.getState().handleChatroomPause(chatroomId, !value);
    },
    [chatroomId],
  );
  const pin = useCallback(() => {
    cancelAnimationFrame(frame.current);
    if (!following.current || !scroller) return;
    frame.current = requestAnimationFrame(() => {
      if (following.current && scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 1)
        virtuosoRef.current?.scrollTo({ top: scroller.scrollHeight, behavior: "auto" });
    });
  }, [scroller, virtuosoRef]);
  const resume = useCallback(() => {
    changeFollowing(true);
    pin();
  }, [changeFollowing, pin]);
  const followOutput = useCallback(() => (following.current ? "auto" : false), []);

  // A rolling 200-message window can change every row without changing length.
  useLayoutEffect(pin, [messages, pin]);
  useEffect(() => {
    following.current = true;
    setPaused(false);
    useChatStore.getState().handleChatroomPause(chatroomId, false);
    return () => cancelAnimationFrame(frame.current);
  }, [chatroomId]);
  useEffect(() => {
    if (!scroller) return;
    let userUntil = 0,
      dragging = false,
      touchY;
    const userScroll = () => {
      userUntil = performance.now() + 500;
    };
    const wheel = (event) => {
      userScroll();
      if (event.deltaY < 0) changeFollowing(false);
    };
    const key = (event) => {
      if (event.target.closest('input,textarea,button,[contenteditable="true"],[role="menu"]')) return;
      if (["ArrowUp", "PageUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey)) {
        userScroll();
        changeFollowing(false);
      } else if (event.key === "End") {
        userScroll();
        resume();
      } else if (["ArrowDown", "PageDown", " "].includes(event.key)) userScroll();
    };
    const pointer = (event) => {
      // The native scrollbar occupies the area beyond the scroller's client width.
      const box = scroller.getBoundingClientRect();
      if (event.clientX >= box.left + scroller.clientWidth) {
        dragging = true;
        userScroll();
        changeFollowing(false);
      }
    };
    const release = () => {
      const wasDragging = dragging;
      dragging = false;
      if (wasDragging) {
        userScroll();
        if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 6) resume();
      }
    };
    const touchStart = (event) => {
      touchY = event.touches[0]?.clientY;
    };
    const touchMove = (event) => {
      const y = event.touches[0]?.clientY;
      userScroll();
      if (y > touchY) changeFollowing(false);
      touchY = y;
    };
    const scroll = () => {
      const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 6;
      if (dragging) changeFollowing(nearBottom);
      else if (performance.now() < userUntil && nearBottom) changeFollowing(true);
      else if (following.current) pin();
    };
    scroller.addEventListener("wheel", wheel, { passive: true });
    scroller.addEventListener("keydown", key);
    scroller.addEventListener("pointerdown", pointer);
    scroller.addEventListener("touchstart", touchStart, { passive: true });
    scroller.addEventListener("touchmove", touchMove, { passive: true });
    scroller.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    const resize = new ResizeObserver(pin);
    resize.observe(scroller);
    pin();
    return () => {
      resize.disconnect();
      scroller.removeEventListener("wheel", wheel);
      scroller.removeEventListener("keydown", key);
      scroller.removeEventListener("pointerdown", pointer);
      scroller.removeEventListener("touchstart", touchStart);
      scroller.removeEventListener("touchmove", touchMove);
      scroller.removeEventListener("scroll", scroll);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
      cancelAnimationFrame(frame.current);
    };
  }, [scroller, pin, resume, changeFollowing]);
  return { paused, resume, pin, followOutput, scrollerRef: setScroller };
}
