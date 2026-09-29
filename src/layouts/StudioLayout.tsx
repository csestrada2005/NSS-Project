import { useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import NebuLoader from '../components/brand/NebuLoader';
import { useForgeLang } from '@/i18n/forge/useForgeLang';

export function StudioLayout() {
  const { user, loading } = useAuth();

  // Nombre de la pestaña por zona: Wyrd Forge aquí, Nebu Studio en WorkspaceLayout.
  useEffect(() => {
    document.title = 'Wyrd Forge';
  }, []);

  // `lang` del documento = idioma elegido en Wyrd (lectores de pantalla,
  // corrector del navegador, traducción automática).
  const { lang } = useForgeLang();
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  if (loading) {
    return (
      <div className="wyrd-root h-screen w-screen flex items-center justify-center bg-background">
        <NebuLoader size={160} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="wyrd-root h-screen w-screen overflow-hidden">
      <Outlet />
    </div>
  );
}
