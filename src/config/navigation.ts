import {
  ChartPie,
  HandCoins,
  MapPin,
  Calendar,
  UserStar,
  Store,
  CircleCheckBig,
  CalendarClock,
  ChartSpline,
  User,
  CloudUpload,
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
    managerIcon: ChartPie,
    collectorIcon: ChartPie,
    roles: ["manager", "collector"],
  },
  {
    id: "collections",
    managerName: "Cobranças",
    collectorName: "Minha Carteira",
    managerIcon: HandCoins,
    collectorIcon: HandCoins,
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
    managerIcon: ChartSpline,
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
    managerIcon: UserStar,
    roles: ["manager"],
  },
  {
    id: "visit-tracking",
    managerName: "Acompanhamento",
    managerIcon: CalendarClock,
    roles: ["manager"],
  },
  {
    id: "authorization",
    managerName: "Autorizações",
    managerIcon: CircleCheckBig,
    roles: ["manager"],
  },
  {
    id: "users",
    managerName: "Usuários",
    managerIcon: User,
    roles: ["manager"],
  },
  {
    id: "database-upload",
    managerName: "Upload de Dados",
    managerIcon: CloudUpload,
    roles: ["manager"],
  },
];
