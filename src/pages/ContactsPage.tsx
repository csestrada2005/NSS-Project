import { Contact } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import EmptyState from "@/components/EmptyState";

const ContactsPage = () => {
  const { lang } = useLanguage();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {lang === "es" ? "Contactos" : "Contacts"}
          </h1>
          <p className="text-sm mt-1 text-muted-foreground">
            {lang === "es" ? "Clientes, prospectos y colaboradores" : "Clients, prospects and collaborators"}
          </p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          + {lang === "es" ? "Nuevo contacto" : "New contact"}
        </button>
      </div>
      <div className="rounded-xl bg-card border border-border">
        <EmptyState
          icon={Contact}
          title={{ es: "Contactos vacio", en: "Contacts empty" }}
          subtitle={{ es: "Agrega tu primer contacto para comenzar.", en: "Add your first contact to get started." }}
          ctaLabel={{ es: "+ Agregar contacto", en: "+ Add contact" }}
        />
      </div>
    </div>
  );
};

export default ContactsPage;)}