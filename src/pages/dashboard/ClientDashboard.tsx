import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FolderOpen, CreditCard, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getClientProjects, getClientPayments } from "@/services/data/supabaseData";
import type { Project, Payment } from "@/types";

const STATUS_COLORS: Record<Project["status"], string> = {
  active: "bg-emerald-500/10 text-emerald-500",
  completed: "bg-blue-500/10 text-blue-500",
  paused: "bg-amber-500/10 text-amber-500",
  cancelled: "bg-rose-500/10 text-rose-500",
};

const STATUS_LABELS: Record<Project["status"], { es: string; en: string }> = {
  active: { es: "Activo", en: "Active" },
  completed: { es: "Completado", en: "Completed" },
  paused: { es: "Pausado", en: "Paused" },
  cancelled: { es: "Cancelado", en: "Cancelled" },
};

const PAYMENT_STATUS_COLORS: Record<Payment["status"], string> = {
  paid: "bg-emerald-500/10 text-emerald-500",
  pending: "bg-amber-500/10 text-amber-500",
  overdue: "bg-rose-500/10 text-rose-500",
};

const PAYMENT_STATUS_LABELS: Record<
  Payment["status"],
  { es: string; en: string }
> = {
  paid: { es: "Pagado", en: "Paid" },
  pending: { es: "Pendiente", en: "Pending" },
  overdue: { es: "Vencido", en: "Overdue" },
};

const formatCurrency = (amount: number, locale: string) =>
  new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);

const ClientDashboard = () => {
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const projectsData = await getClientProjects();
        if (cancelled) return;
        setProjects(projectsData);

        const projectIds = projectsData.map((p) => p.id);
        const paymentsData = await getClientPayments(projectIds);
        if (!cancelled) setPayments(paymentsData);
      } catch (err) {
        console.error("Client dashboard fetch failed:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-muted">
          <FolderOpen size={24} className="text-muted-foreground" />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          {lang === "es" ? "Sin proyectos asignados" : "No projects assigned"}
        </h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          {lang === "es"
            ? "Cuando te asignen un proyecto, aparecerá aquí con su estado y detalles."
            : "When a project is assigned to you, it will appear here with its status and details."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          {lang === "es" ? "Mis proyectos" : "My projects"}
        </h1>
        <p className="text-sm mt-0.5 text-muted-foreground">
          {lang === "es"
            ? "Estado actual de tus proyectos"
            : "Current status of your projects"}
        </p>
      </div>

      {/* Project status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {projects.map((project) => (
          <div
            key={project.id}
            onClick={() => navigate('/projects')}
            className="rounded-xl p-5 bg-card border border-border hover:border-primary/20 transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="text-sm font-semibold text-foreground leading-snug">
                {project.title}
              </h3>
              <span
                className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[project.status]}`}
              >
                {STATUS_LABELS[project.status][lang]}
              </span>
            </div>
            {project.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {project.description}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground mt-3">
              {new Date(project.created_at).toLocaleDateString(
                lang === "es" ? "es-MX" : "en-US",
                { day: "numeric", month: "long", year: "numeric" }
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Payments section */}
      <div className="rounded-xl bg-card border border-border">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <CreditCard size={15} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            {lang === "es" ? "Estado de pagos" : "Payment status"}
          </h2>
        </div>
        <div className="p-2">
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {lang === "es" ? "Sin pagos registrados" : "No payments recorded"}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex items-center justify-between px-3 py-3 rounded-lg hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {formatCurrency(payment.amount, lang)}
                    </p>
                    {payment.due_date && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {lang === "es" ? "Vence" : "Due"}{" "}
                        {new Date(payment.due_date).toLocaleDateString(
                          lang === "es" ? "es-MX" : "en-US",
                          { day: "numeric", month: "short", year: "numeric" }
                        )}
                      </p>
                    )}
                  </div>
                  <span
                    className={`ml-3 shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${PAYMENT_STATUS_COLORS[payment.status]}`}
                  >
                    {PAYMENT_STATUS_LABELS[payment.status][lang]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientDashboard;
