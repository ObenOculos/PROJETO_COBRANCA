import {
  BarChart3,
  Target,
  MapPin,
  Calendar,
  FileText,
  TrendingUp,
  Store,
  UserCheck,
  AlertTriangle,
  Users,
  Download,
  LucideIcon,
} from "lucide-react";

export interface NavItemConfig {
  id: string;
  managerName: string;
  collectorName?: string;
  managerIcon: LucideIcon;
  collectorIcon?: LucideIcon;
  roles: ("manager" | "collector")[];
}

export const navigationItems: NavItemConfig[] = [
  {
    id: "overview",
    managerName: "Visão Geral",
    collectorName: "Resumo",
    managerIcon: BarChart3,
    collectorIcon: BarChart3,
    roles: ["manager", "collector"],
  },
  {
    id: "collections",
    managerName: "Cobranças",
    collectorName: "Minha Carteira",
    managerIcon: FileText,
    collectorIcon: Target,
    roles: ["manager", "collector"],
  },
  {
    id: "route",
    managerName: "Rota de Cobrança",
    collectorName: "Rota de Cobrança",
    managerIcon: MapPin,
    collectorIcon: MapPin,
    roles: ["collector"],
  },
  {
    id: "visits",
    managerName: "Visitas Agendadas",
    collectorName: "Visitas Agendadas",
    managerIcon: Calendar,
    collectorIcon: Calendar,
    roles: ["collector"],
  },
  {
    id: "performance",
    managerName: "Desempenho",
    managerIcon: TrendingUp,
    roles: ["manager"],
  },
  {
    id: "stores",
    managerName: "Lojas",
    managerIcon: Store,
    roles: ["manager"],
  },
  {
    id: "clients",
    managerName: "Clientes",
    managerIcon: UserCheck,
    roles: ["manager"],
  },
  {
    id: "visit-tracking",
    managerName: "Acompanhamento",
    managerIcon: AlertTriangle,
    roles: ["manager"],
  },
  {
    id: "authorization",
    managerName: "Autorizações",
    managerIcon: UserCheck,
    roles: ["manager"],
  },
  {
    id: "users",
    managerName: "Usuários",
    managerIcon: Users,
    roles: ["manager"],
  },
  {
    id: "database-upload",
    managerName: "Upload de Dados",
    managerIcon: Download,
    roles: ["manager"],
  },
];
