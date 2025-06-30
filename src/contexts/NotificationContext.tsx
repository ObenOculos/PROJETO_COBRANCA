import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { useCollection } from './CollectionContext';
import { useAuth } from './AuthContext';

export interface Notification {
  id: string;
  type: 'payment' | 'overdue' | 'assignment' | 'system' | 'visit';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  priority: 'low' | 'medium' | 'high';
  relatedId?: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  clearAllNotifications: () => void;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissedNotifications, setDismissedNotifications] = useState<Set<string>>(() => {
    // Carregar notificações dispensadas do localStorage
    try {
      const saved = localStorage.getItem('dismissedNotifications');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const { collections } = useCollection();
  const { user } = useAuth();

  // Salvar notificações dispensadas no localStorage sempre que mudarem
  useEffect(() => {
    try {
      localStorage.setItem('dismissedNotifications', JSON.stringify(Array.from(dismissedNotifications)));
    } catch (error) {
      console.error('Erro ao salvar notificações dispensadas:', error);
    }
  }, [dismissedNotifications]);

  // Generate notifications based on system data with debouncing
  useEffect(() => {
    if (!collections || !user) return;

    // Debounce notifications generation
    const timeoutId = setTimeout(() => {
      generateAndSetNotifications();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [collections, user?.id]); // Only depend on user.id, not entire user object

  const generateAndSetNotifications = () => {
    if (!user) return; // Guard clause for null user
    
    const generateNotifications = () => {
      const newNotifications: Omit<Notification, 'id' | 'timestamp' | 'read'>[] = [];
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);

      // Filter collections based on user type
      const userCollections = user.type === 'manager' 
        ? collections 
        : collections.filter(c => c.user_id === user.id);

      // For collectors: Check overdue visits
      if (user.type === 'collector') {
        const overdueVisits = userCollections.filter(c => {
          if (c.status === 'received') return false;
          
          // Check if has a scheduled visit that's overdue
          if (c.data_visita_agendada) {
            const visitDate = new Date(c.data_visita_agendada);
            if (isNaN(visitDate.getTime())) return false; // Skip invalid dates
            visitDate.setHours(23, 59, 59, 999); // End of the visit day
            return visitDate < now && !c.data_visita_realizada;
          }
          
          return false;
        });

        if (overdueVisits.length > 0) {
          newNotifications.push({
            type: 'visit',
            title: 'Visitas Atrasadas',
            message: `${overdueVisits.length} visita${overdueVisits.length > 1 ? 's agendadas' : ' agendada'} em atraso`,
            priority: 'high',
          });
        }

        // Check visits scheduled for today
        const visitsToday = userCollections.filter(c => {
          if (c.status === 'received' || c.data_visita_realizada) return false;
          
          if (c.data_visita_agendada) {
            const visitDate = new Date(c.data_visita_agendada);
            if (isNaN(visitDate.getTime())) return false; // Skip invalid dates
            return visitDate >= todayStart && visitDate < tomorrowStart;
          }
          
          return false;
        });

        if (visitsToday.length > 0) {
          newNotifications.push({
            type: 'visit',
            title: 'Visitas de Hoje',
            message: `${visitsToday.length} visita${visitsToday.length > 1 ? 's agendadas' : ' agendada'} para hoje`,
            priority: 'medium',
          });
        }

        // Check for collections without scheduled visits (pending scheduling)
        const unscheduledCollections = userCollections.filter(c => {
          return c.status !== 'received' && !c.data_visita_agendada && !c.data_visita_realizada;
        });

        if (unscheduledCollections.length > 0) {
          newNotifications.push({
            type: 'visit',
            title: 'Visitas Não Agendadas',
            message: `${unscheduledCollections.length} cobrança${unscheduledCollections.length > 1 ? 's' : ''} sem visita agendada`,
            priority: 'medium',
          });
        }
      }

      // 1. Overdue payments (with date validation)
      const overdue = userCollections.filter(c => {
        if (c.status === 'received') return false;
        if (!c.data_vencimento) return false; // Skip if no due date
        const dueDate = new Date(c.data_vencimento);
        return !isNaN(dueDate.getTime()) && dueDate < todayStart; // Validate date
      });

      if (overdue.length > 0) {
        newNotifications.push({
          type: 'overdue',
          title: 'Pagamentos em Atraso',
          message: `${overdue.length} pagamento${overdue.length > 1 ? 's' : ''} em atraso`,
          priority: 'high',
        });
      }

      // 2. Due today (with date validation)
      const dueToday = userCollections.filter(c => {
        if (c.status === 'received') return false;
        if (!c.data_vencimento) return false;
        const dueDate = new Date(c.data_vencimento);
        return !isNaN(dueDate.getTime()) && dueDate >= todayStart && dueDate < tomorrowStart;
      });

      if (dueToday.length > 0) {
        newNotifications.push({
          type: 'payment',
          title: 'Vencimentos de Hoje',
          message: `${dueToday.length} pagamento${dueToday.length > 1 ? 's vencem' : ' vence'} hoje`,
          priority: 'medium',
        });
      }

      // 3. Recent payments (last 24 hours)
      const recentPayments = userCollections.filter(c => {
        if (c.status !== 'received') return false;
        const paymentDateStr = c.data_recebimento || c.updated_at;
        if (!paymentDateStr) return false; // Skip if no payment date
        const paymentDate = new Date(paymentDateStr);
        if (isNaN(paymentDate.getTime())) return false; // Skip invalid dates
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return paymentDate >= yesterday;
      });

      if (recentPayments.length > 0) {
        newNotifications.push({
          type: 'payment',
          title: 'Pagamentos Recebidos',
          message: `${recentPayments.length} pagamento${recentPayments.length > 1 ? 's recebidos' : ' recebido'} nas últimas 24h`,
          priority: 'low',
        });
      }

      // 4. Manager-specific: Unassigned collections
      if (user.type === 'manager') {
        const unassigned = collections.filter(c => !c.user_id);
        if (unassigned.length > 0) {
          newNotifications.push({
            type: 'assignment',
            title: 'Cobranças Não Atribuídas',
            message: `${unassigned.length} cobrança${unassigned.length > 1 ? 's' : ''} sem cobrador atribuído`,
            priority: 'medium',
          });
        }
      }

      // 5. High value pending payments
      const highValuePending = userCollections.filter(c => {
        return c.status !== 'received' && c.valor_original > 5000;
      });

      if (highValuePending.length > 0) {
        newNotifications.push({
          type: 'payment',
          title: 'Valores Altos Pendentes',
          message: `${highValuePending.length} cobrança${highValuePending.length > 1 ? 's de alto valor' : ' de alto valor'} pendente${highValuePending.length > 1 ? 's' : ''}`,
          priority: 'high',
        });
      }

      return newNotifications;
    };

    const generatedNotifications = generateNotifications();
    
    // Only update if notifications changed
    if (generatedNotifications.length > 0) {
      setNotifications(prev => {
        // Remove old auto-generated notifications (keep only manual 'system' ones)
        const manualNotifications = prev.filter(n => n.type === 'system');
        const newOnes = generatedNotifications
          .filter(n => !dismissedNotifications.has(`${n.type}-${n.title}`))
          .map((n, index) => ({
            ...n,
            id: `${n.type}-${n.title}-${Date.now()}-${index}`, // More unique ID
            timestamp: new Date(),
            read: false,
          }));
        
        // Limit total notifications to prevent memory issues
        const allNotifications = [...manualNotifications, ...newOnes];
        return allNotifications.slice(0, 50); // Max 50 notifications
      });
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev =>
      prev.map(n => ({ ...n, read: true }))
    );
  };

  const clearNotification = (id: string) => {
    const notification = notifications.find(n => n.id === id);
    if (notification && notification.type !== 'system') {
      const newDismissed = new Set(dismissedNotifications);
      newDismissed.add(`${notification.type}-${notification.title}`);
      setDismissedNotifications(newDismissed);
    }
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAllNotifications = () => {
    // Mark all system notifications as dismissed
    const newDismissed = new Set(dismissedNotifications);
    notifications.forEach(n => {
      if (n.type !== 'system') {
        newDismissed.add(`${n.type}-${n.title}`);
      }
    });
    setDismissedNotifications(newDismissed);
    setNotifications([]);
  };

  const addNotification = (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      read: false,
    };
    setNotifications(prev => [newNotification, ...prev]);
  };

  // Memoize sorted notifications to avoid sorting on every render
  const sortedNotifications = useMemo(() => {
    return notifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [notifications]);

  const value: NotificationContextType = {
    notifications: sortedNotifications,
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