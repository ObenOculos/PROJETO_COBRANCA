import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useMemo,
  useRef,
} from "react";
import { useCollection } from "./CollectionContext";
import { useAuth } from "./AuthContext";

import { UserType } from "../types";
import { todayLocalStr } from "../config/visitStatus";
import {
  NotificacaoGerada,
  gerarNotificacoes,
} from "../config/notificationRules";

export interface Notification {
  id: string;
  type: "payment" | "overdue" | "assignment" | "system" | "visit";
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  priority: "low" | "medium" | "high";
  relatedId?: string;
  // Direcionamento por perfil. Deriva de UserType para nao ficar defasado
  // quando um perfil novo e criado (ja aconteceu com Terceirizado e Juridico).
  targetUserType?: UserType | "all";
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  clearAllNotifications: () => void;
  addNotification: (
    notification: Omit<Notification, "id" | "timestamp" | "read">,
  ) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined,
);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider",
    );
  }
  return context;
};

// ---------------------------------------------------------------------------
// Lida/dispensada por usuario, com o dia em que foi marcada (para podar).
// ---------------------------------------------------------------------------

type Marcas = Record<string, string>; // id da notificacao -> dia (YYYY-MM-DD)

interface EstadoSalvo {
  lidas: Marcas;
  dispensadas: Marcas;
}

const storageKey = (userId: string) => `notificacoes:${userId}`;
const DIAS_GUARDADOS = 3;

const carregarEstado = (userId: string): EstadoSalvo => {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<EstadoSalvo>;
      return {
        lidas: parsed.lidas ?? {},
        dispensadas: parsed.dispensadas ?? {},
      };
    }
  } catch {
    // armazenamento indisponivel: segue sem memoria
  }
  return { lidas: {}, dispensadas: {} };
};

const podar = (marcas: Marcas, hoje: string): Marcas => {
  const limite = new Date();
  limite.setDate(limite.getDate() - DIAS_GUARDADOS);
  const corte = todayLocalStr(limite);
  return Object.fromEntries(
    Object.entries(marcas).filter(([, dia]) => dia >= corte && dia <= hoje),
  );
};

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({
  children,
}) => {
  const { collections, salePayments, scheduledVisits, getClientGroups } =
    useCollection();
  const { user } = useAuth();

  const [geradas, setGeradas] = useState<NotificacaoGerada[]>([]);
  const [manuais, setManuais] = useState<Notification[]>([]);
  // `dono` evita gravar o estado de um usuario na chave de outro ao trocar
  // de login (o efeito de salvar roda antes do estado novo ser aplicado).
  const [estado, setEstado] = useState<EstadoSalvo & { dono: string | null }>({
    lidas: {},
    dispensadas: {},
    dono: null,
  });
  // Hora em que cada notificacao apareceu pela primeira vez nesta sessao.
  const vistaEm = useRef(new Map<string, Date>());

  // Versao antiga guardava dispensas para sempre, sem separar por usuario.
  useEffect(() => {
    try {
      localStorage.removeItem("dismissedNotifications");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const hoje = todayLocalStr();
    const salvo = carregarEstado(user.id);
    setEstado({
      lidas: podar(salvo.lidas, hoje),
      dispensadas: podar(salvo.dispensadas, hoje),
      dono: user.id,
    });
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || estado.dono !== user.id) return;
    try {
      const { lidas, dispensadas } = estado;
      localStorage.setItem(
        storageKey(user.id),
        JSON.stringify({ lidas, dispensadas }),
      );
    } catch (error) {
      console.error("Erro ao salvar estado das notificações:", error);
    }
  }, [estado, user?.id]);

  // Debounce: a carga progressiva publica `collections` varias vezes.
  useEffect(() => {
    if (!collections || !user || !salePayments || !scheduledVisits) return;

    const timeoutId = setTimeout(() => {
      const agora = new Date();
      const grupos =
        user.type === "manager" ? getClientGroups() : getClientGroups(user.id);
      setGeradas(
        gerarNotificacoes({
          user,
          grupos,
          salePayments,
          scheduledVisits,
          hoje: todayLocalStr(agora),
          agora,
        }),
      );
    }, 500);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- so o id do usuario importa
  }, [collections, user?.id, salePayments, scheduledVisits, getClientGroups]);

  const notifications = useMemo(() => {
    if (!user) return [];

    const automaticas: Notification[] = geradas
      .filter((n) => !estado.dispensadas[n.id])
      .map((n) => {
        if (!vistaEm.current.has(n.id)) vistaEm.current.set(n.id, new Date());
        return {
          ...n,
          timestamp: vistaEm.current.get(n.id)!,
          read: !!estado.lidas[n.id],
        };
      });

    return [...manuais, ...automaticas]
      .filter(
        (n) =>
          !n.targetUserType ||
          n.targetUserType === "all" ||
          n.targetUserType === user.type,
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [geradas, manuais, estado, user]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const isManual = (id: string) => manuais.some((n) => n.id === id);

  const marcar = (campo: keyof EstadoSalvo, ids: string[]) => {
    if (ids.length === 0) return;
    const hoje = todayLocalStr();
    setEstado((prev) => ({
      ...prev,
      [campo]: {
        ...prev[campo],
        ...Object.fromEntries(ids.map((id) => [id, hoje])),
      },
    }));
  };

  const markAsRead = (id: string) => {
    if (isManual(id)) {
      setManuais((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
    } else {
      marcar("lidas", [id]);
    }
  };

  const markAllAsRead = () => {
    setManuais((prev) => prev.map((n) => ({ ...n, read: true })));
    marcar(
      "lidas",
      notifications.filter((n) => !isManual(n.id)).map((n) => n.id),
    );
  };

  const clearNotification = (id: string) => {
    if (isManual(id)) {
      setManuais((prev) => prev.filter((n) => n.id !== id));
    } else {
      marcar("dispensadas", [id]);
    }
  };

  const clearAllNotifications = () => {
    setManuais([]);
    marcar(
      "dispensadas",
      notifications.filter((n) => !isManual(n.id)).map((n) => n.id),
    );
  };

  const addNotification = (
    notification: Omit<Notification, "id" | "timestamp" | "read">,
  ) => {
    const newNotification: Notification = {
      ...notification,
      id: `manual|${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      read: false,
    };
    setManuais((prev) => [newNotification, ...prev].slice(0, 50));
  };

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAllNotifications,
    addNotification,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
