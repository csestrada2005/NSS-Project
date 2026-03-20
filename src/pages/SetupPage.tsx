import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LogOut, Clock, RefreshCw, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

const SetupPage = () => {
  const { signOut, refreshProfile } = useAuth();
  const { lang } = useLanguage();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auto-refresh every 5 seconds while on this page (for when admin approves)
  useEffect(() => {
    let isPolling = false;

    const interval = setInterval(async () => {
      if (isPolling) return;
      isPolling = true;
      try {
        await refreshProfile();
      } finally {
        isPolling = false;
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [refreshProfile]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.race([
        refreshProfile(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 5000)
        )
      ]);
    } catch (err) {
      console.error('Refresh failed or timed out:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <section className="relative h-screen w-screen flex flex-col items-center justify-center bg-[#0A0A0A] overflow-hidden">
      {/* Dark Scrim & Grid */}
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />
      <div className="absolute inset-0 opacity-[0.04] bg-[linear-gradient(rgba(255,255,255,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.4)_1px,transparent_1px)] bg-[size:60px_60px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,transparent_40%,rgba(10,10,10,0.85)_100%)] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center max-w-lg px-6 text-center">
        {/* Logo superior */}
        <motion.img
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          src="/logo.png"
          alt="Nebu Studio System"
          className="w-20 sm:w-28 mb-12 opacity-90 drop-shadow-2xl"
        />

        {/* Icono de Reloj animado */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5, type: "spring" }}
          className="flex justify-center mb-8"
        >
          <Clock size={56} className="text-[#E60000] drop-shadow-[0_0_15px_rgba(230,0,0,0.5)]" />
        </motion.div>

        {/* Textos con tipografía display */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="space-y-4 mb-10"
        >
          <h1 className="font-display text-3xl sm:text-4xl tracking-tighter text-white uppercase">
            {lang === 'es' ? 'Cuenta en configuración' : 'Account being configured'}
          </h1>
          <p className="text-white/60 font-light text-sm sm:text-base leading-relaxed max-w-sm mx-auto">
            {lang === 'es'
              ? 'Tu cuenta aún no tiene un rol asignado. Contacta a tu administrador para obtener acceso al sistema.'
              : 'Your account does not have a role assigned yet. Contact your administrator to get access to the system.'}
          </p>
        </motion.div>

        {/* Botones de acción */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="group relative flex items-center justify-center gap-3 px-8 py-3 text-sm font-medium tracking-widest uppercase text-white/60 transition-all hover:text-white overflow-hidden border border-white/20 bg-transparent hover:border-white/50 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isRefreshing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            <span>{isRefreshing ? (lang === 'es' ? 'Verificando...' : 'Checking...') : (lang === 'es' ? 'Actualizar estado' : 'Refresh status')}</span>
          </button>
          <button
            onClick={signOut}
            className="group relative flex items-center justify-center gap-3 px-8 py-3 text-sm font-medium tracking-widest uppercase text-[#E60000] transition-all hover:text-white overflow-hidden border border-[#E60000] bg-transparent"
          >
            <div className="absolute inset-0 bg-[#E60000] -translate-x-full transition-transform duration-300 ease-out group-hover:translate-x-0" />
            <LogOut size={18} className="relative z-10" />
            <span className="relative z-10">{lang === 'es' ? 'Cerrar sesión' : 'Sign out'}</span>
          </button>
        </motion.div>
      </div>

      {/* Línea inferior decorativa */}
      <div className="absolute bottom-0 left-0 right-0 h-[4px] bg-[#E60000] shadow-[0_0_16px_rgba(230,0,0,0.5)]" />
    </section>
  );
};

export default SetupPage;