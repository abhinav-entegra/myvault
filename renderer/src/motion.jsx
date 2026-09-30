import { motion, useReducedMotion, useSpring, useMotionValue, useMotionTemplate } from "motion/react";
import { useEffect } from "react";
import Lenis from "lenis";

export const ease = [0.22, 1, 0.36, 1];

export const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.08 } },
};

export const rise = {
  hidden: { opacity: 0, y: 22, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease } },
};

export function useMotionSafe() {
  const reduce = useReducedMotion();
  return { reduce, t: (v) => (reduce ? {} : v) };
}

/** Masked word-by-word headline reveal. Respects reduced motion via CSS fallback. */
export function SplitReveal({ text, className = "", as: Tag = "span" }) {
  const words = String(text).split(" ");
  const reduce = useReducedMotion();
  const M = motion[Tag] || motion.span;
  if (reduce) return <span className={className}>{text}</span>;
  return (
    <M className={className} variants={container} initial="hidden" animate="show" aria-label={text}>
      {words.map((w, i) => (
        <span key={`${i}-${w}`} className="inline-block overflow-hidden align-bottom pb-[0.08em] -mb-[0.08em]" aria-hidden>
          <motion.span
            className="inline-block will-change-transform"
            variants={{ hidden: { y: "110%" }, show: { y: 0, transition: { duration: 0.85, ease } } }}
          >
            {w}
            {i < words.length - 1 ? "\u00A0" : ""}
          </motion.span>
        </span>
      ))}
    </M>
  );
}

/** Magnetic wrapper — subtle pull toward cursor, desktop pointers only. */
export function Magnetic({ children, strength = 0.22, className = "" }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18 });
  const sy = useSpring(y, { stiffness: 220, damping: 18 });
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      style={{ x: sx, y: sy }}
      onMouseMove={(e) => {
        if (window.matchMedia("(pointer: coarse)").matches) return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/** Cursor spotlight panel — brass glow follows the pointer. */
export function Spotlight({ children, className = "", glow = "216 178 92 / .10" }) {
  const mx = useMotionValue(-400);
  const my = useMotionValue(-400);
  const bg = useMotionTemplate`radial-gradient(340px circle at ${mx}px ${my}px, rgb(${glow}), transparent 70%)`;
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mx.set(e.clientX - r.left);
        my.set(e.clientY - r.top);
      }}
      onMouseLeave={() => {
        mx.set(-400);
        my.set(-400);
      }}
    >
      <motion.div className="pointer-events-none absolute inset-0 z-0" style={{ background: bg }} aria-hidden />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/** Smooth scroll for the workspace. Skips when reduced-motion is set. */
export function useLenis(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let lenis;
    try {
      lenis = new Lenis({ duration: 1.1, easing: (t) => 1 - Math.pow(1 - t, 4) });
    } catch {
      return undefined;
    }
    let id = requestAnimationFrame(function raf(t) {
      lenis.raf(t);
      id = requestAnimationFrame(raf);
    });
    return () => {
      cancelAnimationFrame(id);
      try {
        lenis.destroy();
      } catch {
        //
      }
    };
  }, [enabled]);
}
