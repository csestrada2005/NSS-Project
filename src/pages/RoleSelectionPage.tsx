import { useState } from 'react';
import { Shield, Code2, User, LogOut } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { SupabaseService } from '@/services/SupabaseService';
import { toast } from 'sonner';

type RoleOption = 'admin' | 'dev' | 'cliente';

const ROLES: {
  id: RoleOption;
  icon: React.ElementType;
  title: string;
  description: string;
}[] = [
  { id: 'admin', icon: Shield, title: 'Admin', description: 'Platform owner and manager' },
  { id: 'dev', icon: Code2, title: 'Developer', description: 'Building and managing projects' },
  { id: 'cliente', icon: User, title: 'Client', description: 'Reviewing my projects' },
];

const RoleSelectionPage = () => {
  const { user, signOut } = useAuth();
  const [selected, setSelected] = useState<RoleOption | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleContinue = async () => {
    if (!selected || !user) return;
    setSubmitting(true);

    try {
      const supabase = SupabaseService.getInstance().client;

      const isCliente = selected === 'cliente';

      const { error } = await supabase
        .from('profiles')
        .update({
          pending_role: selected,
          role: isCliente ? 'cliente' : null,
          role_approved: isCliente ? true : false,
        })
        .eq('id', user.id);

      if (error) throw error;

      // Force a page reload so AuthContext re-fetches the updated profile
      window.location.reload();
    } catch (err) {
      console.error('[RoleSelectionPage] submit error:', err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="relative h-screen w-screen flex flex-col items-center justify-center bg-[#0A0A0A] overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />
      <div className="absolute inset-0 opacity-[0.04] bg-[linear-gradient(rgba(255,255,255,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.4)_1px,transparent_1px)] bg-[size:60px_60px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,transparent_40%,rgba(10,10,10,0.85)_100%)] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center max-w-2xl w-full px-6 text-center">
        {/* Logo */}
        <motion.img
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          src="/logo.png"
          alt="Nebu Studio System"
          className="w-20 sm:w-28 mb-10 opacity-90 drop-shadow-2xl"
        />

        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="mb-10"
        >
          <h1 className="font-display text-3xl sm:text-4xl tracking-tighter text-white uppercase">
            Welcome to NEBU
          </h1>
          <p className="text-white/50 text-sm mt-2">What's your role?</p>
        </motion.div>

        {/* Role cards */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full mb-10"
        >
          {ROLES.map((role) => {
            const Icon = role.icon;
            const isSelected = selected === role.id;
            return (
              <button
                key={role.id}
                onClick={() => setSelected(role.id)}
                className={`flex flex-col items-center gap-4 p-6 rounded-xl border transition-all duration-200 text-left group ${
                  isSelected
                    ? 'border-[#E60000] bg-[#E60000]/10 text-white'
                    : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-white/30 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                    isSelected ? 'bg-[#E60000]/20' : 'bg-white/5 group-hover:bg-white/10'
                  }`}
                >
                  <Icon
                    size={22}
                    className={isSelected ? 'text-[#E60000]' : 'text-white/50 group-hover:text-white/80'}
                  />
                </div>
                <div className="text-center">
                  <p className={`font-semibold text-sm ${isSelected ? 'text-white' : ''}`}>{role.title}</p>
                  <p className="text-xs mt-1 text-white/40 leading-relaxed">{role.description}</p>
                </div>
              </button>
            );
          })}
        </motion.div>

        {/* Continue button */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          onClick={handleContinue}
          disabled={!selected || submitting}
          className="group relative flex items-center justify-center gap-3 px-10 py-3 text-sm font-medium tracking-widest uppercase overflow-hidden border border-[#E60000] bg-transparent transition-all disabled:opacity-30 disabled:cursor-not-allowed enabled:text-[#E60000] enabled:hover:text-white"
        >
          <div className="absolute inset-0 bg-[#E60000] -translate-x-full transition-transform duration-300 ease-out group-enabled:group-hover:translate-x-0" />
          <span className="relative z-10">{submitting ? 'Saving...' : 'Continue'}</span>
        </motion.button>

        {/* Sign out link */}
        <button
          onClick={signOut}
          className="mt-6 flex items-center gap-2 text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          <LogOut size={13} />
          Sign out
        </button>
      </div>

      {/* Bottom accent */}
      <div className="absolute bottom-0 left-0 right-0 h-[4px] bg-[#E60000] shadow-[0_0_16px_rgba(230,0,0,0.5)]" />
    </section>
  );
};

export default RoleSelectionPage;
