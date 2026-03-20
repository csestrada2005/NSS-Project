import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Save, User, Bell, Mail, Camera, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SupabaseService } from '@/services/SupabaseService';

const supabase = SupabaseService.getInstance().client;

const labels = {
  settings: { en: 'Settings', es: 'Configuración' },
  manageAccount: { en: 'Manage your account settings and preferences.', es: 'Gestiona la configuración de tu cuenta y preferencias.' },
  profile: { en: 'Profile', es: 'Perfil' },
  notifications: { en: 'Notifications', es: 'Notificaciones' },
  profileInfo: { en: 'Profile Information', es: 'Información de Perfil' },
  profileDesc: { en: 'Update your personal details and public profile.', es: 'Actualiza tus datos personales y perfil público.' },
  fullName: { en: 'Full Name', es: 'Nombre Completo' },
  email: { en: 'Email Address', es: 'Correo Electrónico' },
  profilePicture: { en: 'Profile Picture', es: 'Foto de Perfil' },
  saveChanges: { en: 'Save Changes', es: 'Guardar Cambios' },
  saving: { en: 'Saving…', es: 'Guardando…' },
  saved: { en: 'Saved!', es: '¡Guardado!' },
  saveError: { en: 'Failed to save. Try again.', es: 'Error al guardar. Intenta de nuevo.' },
  notifPrefs: { en: 'Notification Preferences', es: 'Preferencias de Notificación' },
  notifDesc: { en: 'Choose how and when you want to be notified.', es: 'Elige cómo y cuándo quieres recibir notificaciones.' },
  emailAlerts: { en: 'Email Alerts', es: 'Alertas por Correo' },
  emailAlertsDesc: { en: 'Receive daily summaries and critical alerts via email.', es: 'Recibe resúmenes diarios y alertas críticas por correo.' },
  inAppNotifs: { en: 'In-App Notifications', es: 'Notificaciones en la Aplicación' },
  inAppNotifsDesc: { en: 'Receive real-time notifications for project updates, payments, and milestones.', es: 'Recibe notificaciones en tiempo real sobre proyectos, pagos e hitos.' },
  language: { en: 'Language', es: 'Idioma' },
  languageDesc: { en: 'Switch between English and Spanish.', es: 'Cambia entre inglés y español.' },
};

interface AvatarUploadProps {
  userId: string;
  avatarUrl: string;
  displayName: string;
  onUpload: (url: string) => void;
}

function AvatarUpload({ userId, avatarUrl, displayName, onUpload }: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { lang } = useLanguage();

  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

  const uploadAvatar = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2MB');
      return;
    }
    const fileExt = file.name.split('.').pop();
    const filePath = `${userId}/avatar.${fileExt}`;
    setUploading(true);

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast.error('Failed to upload image');
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
    const publicUrl = data.publicUrl + '?t=' + Date.now();

    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId);
    onUpload(publicUrl);
    toast.success('Profile picture updated');
    setUploading(false);
  };

  return (
    <div className="flex items-center gap-6">
      <div className="relative group">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-20 h-20 rounded-full object-cover border border-border"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-semibold border border-border">
            {initials}
          </div>
        )}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:cursor-not-allowed"
        >
          {uploading ? (
            <Loader2 size={20} className="text-white animate-spin" />
          ) : (
            <Camera size={20} className="text-white" />
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadAvatar(file);
            e.target.value = '';
          }}
        />
      </div>
      <div className="text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{displayName || '—'}</p>
        <p className="text-xs mt-0.5">{lang === 'es' ? 'Haz clic en el avatar para subir una foto nueva' : 'Click the avatar to upload a new photo'}</p>
        <p className="text-xs text-muted-foreground/60">{lang === 'es' ? 'Máx 2MB · JPG, PNG, WebP' : 'Max 2MB · JPG, PNG, WebP'}</p>
      </div>
    </div>
  );
}

const SettingsPage = () => {
  const { user, profile } = useAuth();
  const { lang, setLang } = useLanguage();

  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [emailAlerts, setEmailAlerts] = useState<boolean>(true);
  const [pushNotifications, setPushNotifications] = useState<boolean>(false);

  // Seed fields from loaded profile
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '');
      setAvatarUrl(profile.avatar_url ?? '');
      setEmailAlerts(profile.email_alerts ?? true);
      setPushNotifications(profile.push_notifications ?? false);
    }
  }, [profile]);

  const handleNotifChange = async (field: 'email_alerts' | 'push_notifications', value: boolean) => {
    if (!user) return;
    if (field === 'email_alerts') setEmailAlerts(value);
    else setPushNotifications(value);
    const { error } = await supabase.from('profiles').update({ [field]: value }).eq('id', user.id);
    if (error) toast.error(labels.saveError[lang]);
    else toast.success(labels.saved[lang]);
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() })
      .eq('id', user.id);

    if (error) {
      console.error('[SettingsPage] Failed to update profile:', error);
      toast.error(labels.saveError[lang]);
    } else {
      toast.success(labels.saved[lang]);
    }
    setIsSaving(false);
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto w-full pb-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{labels.settings[lang]}</h1>
        <p className="text-muted-foreground mt-1">{labels.manageAccount[lang]}</p>
      </div>

      <Tabs defaultValue="profile" className="flex flex-col md:flex-row gap-6">
        {/* Sidebar Navigation */}
        <TabsList className="flex flex-col h-auto bg-transparent items-start w-full md:w-64 space-y-2 p-0">
          <TabsTrigger
            value="profile"
            className="w-full justify-start gap-2 data-[state=active]:bg-muted data-[state=active]:shadow-none hover:bg-muted/50 rounded-lg px-4 py-2"
          >
            <User className="h-4 w-4" />
            {labels.profile[lang]}
          </TabsTrigger>
          <TabsTrigger
            value="notifications"
            className="w-full justify-start gap-2 data-[state=active]:bg-muted data-[state=active]:shadow-none hover:bg-muted/50 rounded-lg px-4 py-2"
          >
            <Bell className="h-4 w-4" />
            {labels.notifications[lang]}
          </TabsTrigger>
        </TabsList>

        {/* Content Area */}
        <div className="flex-1">
          {/* Profile Tab */}
          <TabsContent value="profile" className="m-0 focus-visible:outline-none focus-visible:ring-0">
            <Card>
              <CardHeader>
                <CardTitle>{labels.profileInfo[lang]}</CardTitle>
                <CardDescription>{labels.profileDesc[lang]}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Avatar Upload */}
                <div className="grid gap-2">
                  <Label>{labels.profilePicture[lang]}</Label>
                  {user && (
                    <AvatarUpload
                      userId={user.id}
                      avatarUrl={avatarUrl}
                      displayName={fullName}
                      onUpload={(url) => setAvatarUrl(url)}
                    />
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="fullName">{labels.fullName[lang]}</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={labels.fullName[lang]}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">{labels.email[lang]}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={user?.email ?? ''}
                    disabled
                    className="opacity-60"
                  />
                </div>
              </CardContent>
              <CardFooter className="border-t border-border pt-6 flex items-center justify-end">
                <Button
                  className="gap-2"
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      {labels.saving[lang]}
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      {labels.saveChanges[lang]}
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="m-0 focus-visible:outline-none focus-visible:ring-0">
            <Card>
              <CardHeader>
                <CardTitle>{labels.notifPrefs[lang]}</CardTitle>
                <CardDescription>{labels.notifDesc[lang]}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between space-x-2">
                  <div className="flex flex-col space-y-1">
                    <span className="flex items-center gap-2 font-medium">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {labels.emailAlerts[lang]}
                    </span>
                    <span className="text-sm text-muted-foreground">{labels.emailAlertsDesc[lang]}</span>
                  </div>
                  <Switch checked={emailAlerts} onCheckedChange={(v) => handleNotifChange('email_alerts', v)} id="email-alerts" />
                </div>

                <div className="h-px bg-border" />

                <div className="flex items-center justify-between space-x-2">
                  <div className="flex flex-col space-y-1">
                    <span className="flex items-center gap-2 font-medium">
                      <Bell className="h-4 w-4 text-muted-foreground" />
                      {labels.inAppNotifs[lang]}
                    </span>
                    <span className="text-sm text-muted-foreground">{labels.inAppNotifsDesc[lang]}</span>
                  </div>
                  <Switch checked={pushNotifications} onCheckedChange={(v) => handleNotifChange('push_notifications', v)} id="push-notifications" />
                </div>

                <div className="h-px bg-border" />

                <div className="flex items-center justify-between space-x-2">
                  <div className="flex flex-col space-y-1">
                    <span className="flex items-center gap-2 font-medium">
                      {labels.language[lang]}
                    </span>
                    <span className="text-sm text-muted-foreground">{labels.languageDesc[lang]}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setLang('en')}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        lang === 'en'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                      }`}
                    >
                      EN
                    </button>
                    <button
                      onClick={() => setLang('es')}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        lang === 'es'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                      }`}
                    >
                      ES
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default SettingsPage;
