import { useAuth } from '@/contexts/AuthContext';
import { LogOut, Clock } from 'lucide-react';
import { motion } from 'framer-motion';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  dev: 'Developer',
  cliente: 'Client',
};

const PendingApprovalPage = () => {
  const { signOut, profile } = useAuth();
  const pendingRole = profile?.pending_role;

  return (
    <section className="relative h-screen w-screen flex flex-col items-center justify-center bg-[#0A0A0A] overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />
      <div className="absolute inset-0 opacity-[0.04] bg-[linear-gradient(rgba(255,255,255,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.4)_1px,transparent_1px)] bg-[size:60px_60px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,transparent_40%,rgba(10,10,10,0.85)_100%)] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center max-w-lg px-6 text-center">
        {/* Logo */}
        <motion.img
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          src="/logo.png"
          alt="Nebu Studio System"
          className="w-20 sm:w-28 mb-12 opacity-90 drop-shadow-2xl"
        />

        {/* Clock icon */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5, type: 'spring' }}
          className="flex justify-center mb-8"
        >
          <Clock size={56} className="text-[#E60000] drop-shadow-[0_0_15px_rgba(230,0,0,0.5)]" />
        </motion.div>

        {/* Text */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="space-y-4 mb-8"
        >
          <h1 className="font-display text-3xl sm:text-4xl tracking-tighter text-white uppercase">
            Pending Approval
          </h1>
          <p className="text-white/60 font-light text-sm sm:text-base leading-relaxed max-w-sm mx-auto">
            Your account is pending approval. An admin will review your request shortly.
          </p>

          {/* Role badge */}
          {pendingRole && (
            <div className="flex justify-center pt-2">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#E60000]/40 bg-[#E60000]/10 text-[#E60000] text-xs font-medium uppercase tracking-wider">
                Requested: {ROLE_LABELS[pendingRole] ?? pendingRole}
              </span>
            </div>
          )}
        </motion.div>

        {/* Sign out button */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          onClick={signOut}
          className="group relative flex items-center justify-center gap-3 px-8 py-3 text-sm font-medium tracking-widest uppercase text-[#E60000] transition-all hover:text-white overflow-hidden border border-[#E60000] bg-transparent"
        >
          <div className="absolute inset-0 bg-[#E60000] -translate-x-full transition-transform duration-300 ease-out group-hover:translate-x-0" />
          <LogOut size={18} className="relative z-10" />
          <span className="relative z-10">Sign out</span>
        </motion.button>
      </div>

      {/* Bottom accent */}
      <div className="absolute bottom-0 left-0 right-0 h-[4px] bg-[#E60000] shadow-[0_0_16px_rgba(230,0,0,0.5)]" />
    </section>
  );
};

export default PendingApprovalPage;
