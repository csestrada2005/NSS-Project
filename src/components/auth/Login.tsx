import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { motion, useMotionValue, useSpring, useReducedMotion } from 'framer-motion';
import { LoadingScreen } from './LoadingScreen';

// Botón Magnético para Google Auth
const MagneticLoginBtn = ({ onClick }: { onClick: () => void }) => {
  const ref = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 180, damping: 20 });
  const springY = useSpring(y, { stiffness: 180, damping: 20 });

  const handleMove = (e: React.MouseEvent) => {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set((e.clientX - (rect.left + rect.width / 2)) * 0.15);
    y.set((e.clientY - (rect.top + rect.height / 2)) * 0.15);
  };

  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      onMouseMove={handleMove}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      style={{ x: springX, y: springY, boxShadow: "0 4px 20px -4px hsl(0 100% 50% / 0.4)" }}
      whileTap={{ scale: 0.95 }}
      className="mt-8 px-8 py-4 rounded-full bg-[#E60000] text-white font-semibold text-sm transition-shadow hover:bg-red-600 w-full sm:w-auto z-20 relative"
    >
      Log in with Google
    </motion.button>
  );
};

// Animación de texto y trazo de pincel
const SumiHeroReveal = () => {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 200);
    const t2 = setTimeout(() => setPhase(2), 900);
    const t3 = setTimeout(() => setPhase(3), 1150);
    return () => [t1, t2, t3].forEach(clearTimeout);
  }, []);

  const pathMain = "M 6 7 Q 70 4 140 8 T 290 7 T 440 8 T 592 7";
  const pathThin = "M 4 9 Q 70 6 140 10 T 290 9 T 440 10 T 594 9";

  return (
    <div className="relative select-none flex flex-col items-center">
      <div className="relative inline-block text-center" style={{ fontSize: "clamp(2.4rem, 10vw, 8rem)", lineHeight: 1 }}>
        <span className="font-display block text-white/10 tracking-tighter">NEBU STUDIO</span>
        <motion.div
          className="absolute top-0 left-0 h-full w-full overflow-hidden"
          initial={{ clipPath: "inset(0 100% 0 0)" }}
          animate={{ clipPath: phase >= 1 ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="font-display block tracking-tighter text-white">NEBU STUDIO</span>
        </motion.div>
      </div>

      <div className="w-full flex justify-center -mt-2 sm:-mt-4 z-10">
        <svg viewBox="0 0 600 22" className="w-[80%] max-w-[720px]">
          <motion.path d={pathMain} stroke="#E60000" strokeWidth="3.8" fill="none" initial={{ pathLength: 0, opacity: 0 }} animate={phase >= 3 ? { pathLength: 1, opacity: 0.8 } : { pathLength: 0, opacity: 0 }} transition={{ duration: 0.6 }} />
          <motion.path d={pathThin} stroke="#E60000" strokeWidth="1.6" fill="none" initial={{ pathLength: 0, opacity: 0 }} animate={phase >= 3 ? { pathLength: 1, opacity: 0.4 } : { pathLength: 0, opacity: 0 }} transition={{ duration: 0.7, delay: 0.1 }} />
        </svg>
      </div>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: phase >= 3 ? 1 : 0, y: phase >= 3 ? 0 : 10 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="font-mono text-sm tracking-[0.4em] text-white/50 mt-4 uppercase"
      >
        System
      </motion.p>
    </div>
  );
};

export const Login = () => {
  const { signInWithGoogle, loading } = useAuth();
  const [showLoading, setShowLoading] = useState(true);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-[#0A0A0A] text-white">
        <Loader2 className="animate-spin h-8 w-8 text-[#E60000]" />
      </div>
    );
  }

  if (showLoading) {
    return <LoadingScreen onComplete={() => setShowLoading(false)} />;
  }

  return (
    <section className="relative h-screen w-screen flex flex-col items-center justify-center overflow-hidden bg-[#0A0A0A]">
      {/* Dark Scrim & Grid */}
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />
      <div className="absolute inset-0 opacity-[0.04] bg-[linear-gradient(rgba(255,255,255,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.4)_1px,transparent_1px)] bg-[size:60px_60px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,transparent_40%,rgba(10,10,10,0.85)_100%)] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center px-6">
        {/* Asegúrate de colocar la ruta correcta hacia el logo */}
        <img src="/logo.png" alt="Nebu Studio" className="w-24 sm:w-32 mb-8 opacity-90 drop-shadow-2xl" />

        <SumiHeroReveal />

        <motion.p
          className="mt-8 text-base md:text-lg text-white/70 max-w-lg text-center font-light leading-relaxed"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5, duration: 0.6 }}
        >
          Welcome to Nebu Studio System, your personalized builder and manager
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.8, duration: 0.6 }}>
          <MagneticLoginBtn onClick={() => signInWithGoogle()} />
        </motion.div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-[6px] bg-[#E60000] shadow-[0_0_16px_rgba(230,0,0,0.5),0_0_50px_rgba(230,0,0,0.15)]" />
    </section>
  );
};
