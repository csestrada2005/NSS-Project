import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const RITUAL_LINES = [
  { label: "CALIBRATING SYSTEM", status: "OK" },
  { label: "LOADING WORKSPACE", status: "OK" },
  { label: "ALIGNING MODULES", status: "OK" },
];

const EnsoCircle = () => {
  const r = 420;
  const circ = 2 * Math.PI * r;
  return (
    <motion.div className="fixed inset-0 z-[302] flex items-center justify-center pointer-events-none" initial={{ opacity: 1 }} animate={{ opacity: [1, 1, 0] }} transition={{ duration: 1.05, times: [0, 0.65, 1], ease: "easeInOut" }}>
      <svg viewBox="0 0 1000 1000" className="absolute w-[min(200vw,200vh)] h-[min(200vw,200vh)]" style={{ overflow: "visible" }}>
        <motion.circle cx={500} cy={500} r={r} fill="none" stroke="hsl(0 88% 40%)" strokeWidth="38" strokeLinecap="round" strokeDasharray={circ} initial={{ strokeDashoffset: circ, opacity: 0.9 }} animate={{ strokeDashoffset: 0, opacity: [0.9, 0.75, 0.55] }} transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }} style={{ rotate: "-100deg", transformOrigin: "500px 500px" }} />
        <motion.circle cx={500} cy={500} r={r} fill="hsl(0 0% 4%)" initial={{ r: 0, opacity: 0 }} animate={{ r: [0, r * 0.6, r * 4], opacity: [0, 0.7, 1] }} transition={{ duration: 0.75, delay: 0.3, ease: [0.4, 0, 0.2, 1] }} />
      </svg>
    </motion.div>
  );
};

export const LoadingScreen = ({ onComplete }: { onComplete: () => void }) => {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"loading" | "exiting">("loading");
  const startTime = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const duration = 1600;
    const tick = () => {
      const elapsed = Date.now() - startTime.current;
      const raw = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - raw, 3);
      setProgress(Math.floor(eased * 100));
      if (raw < 1) raf = requestAnimationFrame(tick);
      else setTimeout(() => { setPhase("exiting"); setTimeout(onComplete, 950); }, 220);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onComplete]);

  const visibleCount = Math.min(RITUAL_LINES.length, Math.floor((progress / 100) * (RITUAL_LINES.length + 1)));

  return (
    <>
      <AnimatePresence>{phase === "exiting" && <EnsoCircle key="enso" />}</AnimatePresence>
      <AnimatePresence>
        {phase === "loading" && (
          <motion.div className="fixed inset-0 z-[250] overflow-hidden bg-[#0A0A0A] text-white/70" exit={{ opacity: 0 }} transition={{ duration: 0.45 }}>
            <div className="absolute left-8 sm:left-12 top-1/2 -translate-y-[180%]">
              {RITUAL_LINES.slice(0, visibleCount).map((line, i) => (
                <motion.div key={i} className="flex items-center gap-3 mb-2" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
                  <svg width="5" height="6" viewBox="0 0 5 6" fill="none"><path d="M0 0L5 3L0 6V0Z" fill="hsl(0 90% 44%)" /></svg>
                  <span className="font-mono text-[10px] sm:text-[11px] tracking-[0.22em] text-white/70">{line.label}</span>
                  <span className="font-mono text-[9px] tracking-[0.18em] text-[#E60000]">/ {line.status}</span>
                </motion.div>
              ))}
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-8xl md:text-[12rem] text-[#E60000] tracking-tighter leading-none">{String(progress).padStart(3, "0")}</span>
              <div className="mt-8 relative w-48 md:w-64 h-px bg-white/10">
                <motion.div className="absolute top-0 left-0 h-full bg-[#E60000]" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
