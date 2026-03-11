import { LucideIcon } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface EmptyStateProps {
  icon: LucideIcon;
  title: { es: string; en: string };
  subtitle: { es: string; en: string };
  ctaLabel?: { es: string; en: string };
  onCta?: () => void;
}

const EmptyState = ({ icon: Icon, title, subtitle, ctaLabel, onCta }: EmptyStateProps) => {
  const { lang } = useLanguage();
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 bg-primary/5 border border-primary/10">
        <Icon size={26} strokeWidth={1.5} className="text-primary" />
      </div>
      <h3 className="text-base font-semibold mb-1.5 text-foreground">
        {title[lang]}
      </h3>
      <p className="text-sm text-center max-w-xs mb-6 text-muted-foreground">
        {subtitle[lang]}
      </p>
      {ctaLabel && (
        <button
          onClick={onCta}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {ctaLabel[lang]}
        </button>
      )}
    </div>
  );
};

export default EmptyState;)}