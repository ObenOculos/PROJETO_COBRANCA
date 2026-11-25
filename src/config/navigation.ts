import {
  HandCoins,
  MapPin,
  Calendar,
  Store,
  CircleCheckBig,
  ClipboardList,
  Settings,
  PhoneCall,
  Shuffle,
  LucideIcon,
} from "lucide-react";

export interface NavItemConfig {
  id: string;
  managerName: string;
  collectorName?: string;
  managerIcon: LucideIcon;
  collectorIcon?: LucideIcon;
  roles: (
    | "manager"
    | "collector"
    | "internal_collector"
    | "third_party_collector"
    | "legal_collector"
  )[];
}

export const navigationItems: NavItemConfig[] = [
  {
    id: "collections",
    managerName: "Caixa",
    collectorName: "Minha Carteira",
    managerIcon: HandCoins,
    collectorIcon: HandCoins,
    roles: [
      "manager",
      "collector",
      "internal_collector",
      "third_party_collector",
      "legal_collector",
    ],
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
    id: "contact-schedule",
    managerName: "Agendamentos",
    collectorName: "Agendamentos",
    managerIcon: PhoneCall,
    collectorIcon: PhoneCall,
    roles: ["internal_collector", "third_party_collector", "legal_collector"],
  },
  {
    id: "collectors-summary",
    // Era "Cobradores": virou painel da empresa + cobradores (25/11).
    managerName: "Resumo Geral",
    managerIcon: ClipboardList,
    roles: ["manager"],
  },
  {
    // Atribuicao: abas Manual (ClientAssignment) e Automatica/Alcance
    // (CarteiraDistribuicao) -- reuniao 16/11, itens 5/6.
    id: "clients",
    managerName: "Atribuição",
    managerIcon: Shuffle,
    roles: ["manager"],
  },
  {
    id: "stores",
    managerName: "Desempenho Loja",
    managerIcon: Store,
    roles: ["manager"],
  },
  {
    id: "authorization",
    managerName: "Correções",
    managerIcon: CircleCheckBig,
    roles: ["manager"],
  },
  {
    // Configuracoes Gerais: abas Usuarios, Acordos e Upload de Dados
    // (reuniao 16/11, item 9). O id segue "users" (aba padrao).
    id: "users",
    managerName: "Configurações Gerais",
    managerIcon: Settings,
    roles: ["manager"],
  },
];
