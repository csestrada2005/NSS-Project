import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LogOut, Clock } from 'lucide-react';

const SetupPage = () => {
  const { signOut } = useAuth();
  const { lang } = useLanguage();
  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6 max-w-md px-6">
        <div className="flex justify-center">
          <Clock size={48} className="text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">
            {lang === 'es' ? 'Cuenta en configuración' : 'Account being configured'}
          </h1>
          <p className="text-muted-foreground">
            {lang === 'es'
              ? 'Tu cuenta aún no tiene un rol asignado. Contacta a tu administrador para obtener acceso.'
              : 'Your account does not have a role assigned yet. Contact your administrator to get access.'}
          </p>
        </div>
        <button onClick={signOut} className="flex items-center gap-2 mx-auto text-sm text-muted-foreground hover:text-foreground transition-colors">
          <LogOut size={16} />
          {lang === 'es' ? 'Cerrar sesión' : 'Sign out'}
        </button>
      </div>
    </div>
  );
};

export default SetupPage;
