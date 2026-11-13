"use client";

import { useEffect, useRef } from "react";

// A toad head whose eyes follow the cursor. You can grab it and throw it: a spring pulls it back
// to its spot, so it wobbles before it settles. With `peek`, the lower part is hidden at rest, so
// it looks like it's peeking over an edge; grabbing it pulls the whole head out.
// Everything moves through refs and style changes, not React state, so nothing re-renders 60
// times a second.

const PUPIL_TRAVEL = 7; // how far a pupil can move from the middle of its eye, in SVG units
const STIFFNESS = 0.06; // how hard the spring pulls it home, per frame
const DAMPING = 0.86; // how much speed it keeps each frame (lower = settles faster)
const MAX_SPEED = 40; // px per frame, so a fast flick can't throw it off the screen
const PEEK_CLIP = "inset(0 0 40% 0)"; // hides the bottom 40% of the head

export function ToadHead({ className, peek = false }: { className?: string; peek?: boolean }) {
  const headRef = useRef<HTMLDivElement>(null);
  const pupilRefs = useRef<(SVGCircleElement | null)[]>([]);

  // Eyes: on every mouse move, point each pupil toward the cursor.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      for (const pupil of pupilRefs.current) {
        const eye = pupil?.parentElement?.querySelector("[data-eye]");
        if (!pupil || !eye) continue;
        const box = eye.getBoundingClientRect();
        const dx = e.clientX - (box.left + box.width / 2);
        const dy = e.clientY - (box.top + box.height / 2);
        const distance = Math.hypot(dx, dy) || 1;
        // Close to the eye the pupil moves a little; farther away it goes to the edge.
        const travel = Math.min(PUPIL_TRAVEL, distance / 12);
        pupil.style.transform = `translate(${(dx / distance) * travel}px, ${(dy / distance) * travel}px)`;
      }
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  // Drag and throw.
  useEffect(() => {
    const head = headRef.current;
    if (!head) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hide = (on: boolean) => {
      if (peek) head.style.clipPath = on ? PEEK_CLIP : "none";
    };

    let x = 0, y = 0; // how far it is from home, in px
    let vx = 0, vy = 0; // its speed, in px per frame
    let grab: { x: number; y: number } | null = null; // where on the page it was grabbed
    let last = { x: 0, y: 0, t: 0 }; // the last pointer position, to measure the throw
    let frame = 0;

    const draw = () => {
      // Tilt with the sideways speed, so a throw looks like a fling, not a slide.
      const tilt = Math.max(-30, Math.min(30, vx * 1.5));
      head.style.transform = `translate(${x}px, ${y}px) rotate(${tilt}deg)`;
    };

    const spring = () => {
      vx = (vx - x * STIFFNESS) * DAMPING;
      vy = (vy - y * STIFFNESS) * DAMPING;
      x += vx;
      y += vy;
      draw();
      if (Math.abs(x) + Math.abs(y) + Math.abs(vx) + Math.abs(vy) > 0.1) {
        frame = requestAnimationFrame(spring);
      } else {
        x = y = vx = vy = 0;
        draw();
        hide(true);
      }
    };

    const onDown = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      head.setPointerCapture(e.pointerId);
      grab = { x: e.clientX - x, y: e.clientY - y };
      last = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      vx = vy = 0;
      head.style.cursor = "grabbing";
      hide(false);
    };

    const onMove = (e: PointerEvent) => {
      if (!grab) return;
      // Speed in px per frame (one frame ≈ 16 ms), smoothed so one jumpy event doesn't count much.
      const dt = Math.max(1, e.timeStamp - last.t) / 16;
      const clamp = (v: number) => Math.max(-MAX_SPEED, Math.min(MAX_SPEED, v));
      vx = clamp(vx * 0.5 + ((e.clientX - last.x) / dt) * 0.5);
      vy = clamp(vy * 0.5 + ((e.clientY - last.y) / dt) * 0.5);
      last = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      x = e.clientX - grab.x;
      y = e.clientY - grab.y;
      draw();
    };

    const onUp = () => {
      if (!grab) return;
      grab = null;
      head.style.cursor = "";
      if (reduceMotion) {
        x = y = vx = vy = 0;
        draw();
        hide(true);
      } else {
        frame = requestAnimationFrame(spring);
      }
    };

    head.addEventListener("pointerdown", onDown);
    head.addEventListener("pointermove", onMove);
    head.addEventListener("pointerup", onUp);
    head.addEventListener("pointercancel", onUp);
    // Let go outside the browser window: no pointerup arrives, but the capture is lost.
    head.addEventListener("lostpointercapture", onUp);
    return () => {
      cancelAnimationFrame(frame);
      head.removeEventListener("pointerdown", onDown);
      head.removeEventListener("pointermove", onMove);
      head.removeEventListener("pointerup", onUp);
      head.removeEventListener("pointercancel", onUp);
      head.removeEventListener("lostpointercapture", onUp);
    };
  }, [peek]);

  const eyes = [36, 84];
  return (
    <div
      ref={headRef}
      // touch-none: on phones, dragging the head moves the head instead of scrolling the page.
      className={`cursor-grab touch-none select-none ${className ?? ""}`}
      style={peek ? { clipPath: PEEK_CLIP } : undefined}
      title="Grab me"
    >
      <svg viewBox="0 0 120 96" className="h-full w-full overflow-visible" aria-hidden="true">
        <g stroke="#1c2d3e" strokeWidth="4" strokeLinejoin="round">
          {/* Head and chin */}
          <ellipse cx="60" cy="60" rx="54" ry="33" fill="#00ec97" />
          <ellipse cx="60" cy="74" rx="34" ry="16" fill="#ffffff" fillOpacity="0.35" stroke="none" />
          {/* Spots */}
          <g fill="#00a36c" stroke="none">
            <circle cx="16" cy="58" r="5" />
            <circle cx="26" cy="72" r="3.5" />
            <circle cx="104" cy="58" r="5" />
            <circle cx="94" cy="72" r="3.5" />
            <circle cx="60" cy="38" r="4" />
          </g>
          {/* Nostrils and a smug little smile */}
          <circle cx="53" cy="54" r="1.8" fill="#1c2d3e" stroke="none" />
          <circle cx="67" cy="54" r="1.8" fill="#1c2d3e" stroke="none" />
          <path d="M42 68 Q60 80 78 68" fill="none" strokeLinecap="round" />
          {/* Eyes: the white is fixed, the pupil moves toward the cursor. */}
          {eyes.map((cx, i) => (
            <g key={cx}>
              <circle data-eye cx={cx} cy="30" r="18" fill="#fffaf0" />
              <circle
                ref={(el) => {
                  pupilRefs.current[i] = el;
                }}
                cx={cx}
                cy="30"
                r="7"
                fill="#1c2d3e"
                stroke="none"
              />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
