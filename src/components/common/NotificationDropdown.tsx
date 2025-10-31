import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Bell,
  X,
  Check,
  Clock,
  AlertCircle,
  DollarSign,
  Users,
  Settings,
} from "lucide-react";
import { useNotifications } from "../../contexts/NotificationContext";
import type { Notification } from "../../contexts/NotificationContext";

const NotificationDropdown: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAllNotifications,
  } = useNotifications();

  // Memoized functions to prevent unnecessary re-renders
  const handleToggleDropdown = useCallback(() => {
    if (isAnimating) return;
    setIsAnimating(true);
    setIsOpen(!isOpen);
    
    // Reset animation state after animation completes
    setTimeout(() => setIsAnimating(false), 200);
  }, [isOpen, isAnimating]);

  const handleCloseDropdown = useCallback(() => {
    if (isAnimating) return;
    setIsAnimating(true);
    setIsOpen(false);
    setTimeout(() => setIsAnimating(false), 200);
  }, [isAnimating]);

  // Keyboard navigation support
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isOpen) return;

    switch (event.key) {
      case 'Escape':
        handleCloseDropdown();
        buttonRef.current?.focus();
        break;
      case 'Tab':
        // Allow tab navigation within dropdown
        if (!dropdownRef.current?.contains(event.target as Node)) {
          handleCloseDropdown();
        }
        break;
    }
  }, [isOpen, handleCloseDropdown]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !buttonRef.current?.contains(event.target as Node)
      ) {
        handleCloseDropdown();
      }
    };

    const handleKeyDownEvent = (event: KeyboardEvent) => handleKeyDown(event);

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDownEvent);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDownEvent);
    };
  }, [isOpen, handleCloseDropdown, handleKeyDown]);

  // Focus management
  useEffect(() => {
    if (isOpen) {
      // Focus first notification or close button when dropdown opens
      const firstFocusable = dropdownRef.current?.querySelector('button');
      firstFocusable?.focus();
    }
  }, [isOpen]);

  // Memoized icon renderer
  const getNotificationIcon = useCallback((type: string) => {
    const iconProps = { className: "h-4 w-4" };
    switch (type) {
      case "payment":
        return <DollarSign {...iconProps} className="h-4 w-4 text-green-600" />;
      case "overdue":
        return <AlertCircle {...iconProps} className="h-4 w-4 text-red-600" />;
      case "assignment":
        return <Users {...iconProps} className="h-4 w-4 text-blue-600" />;
      case "visit":
        return <Clock {...iconProps} className="h-4 w-4 text-orange-600" />;
      default:
        return <Settings {...iconProps} className="h-4 w-4 text-gray-600" />;
    }
  }, []);

  // Memoized priority color getter
  const getPriorityColor = useCallback((priority: string) => {
    switch (priority) {
      case "high":
        return "border-l-red-500 bg-red-50";
      case "medium":
        return "border-l-yellow-500 bg-yellow-50";
      default:
        return "border-l-blue-500 bg-blue-50";
    }
  }, []);

  // Memoized timestamp formatter with better performance
  const formatTimestamp = useCallback((timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Agora";
    if (minutes < 60) return `${minutes}m atrás`;
    if (hours < 24) return `${hours}h atrás`;
    if (days === 1) return "Ontem";
    if (days < 7) return `${days} dias atrás`;
    return timestamp.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit',
      year: '2-digit' 
    });
  }, []);

  // Memoized handlers for notification actions
  const handleMarkAsRead = useCallback((id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    markAsRead(id);
  }, [markAsRead]);

  const handleClearNotification = useCallback((id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    clearNotification(id);
  }, [clearNotification]);

  const handleMarkAllAsRead = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    markAllAsRead();
  }, [markAllAsRead]);

  const handleClearAllNotifications = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    clearAllNotifications();
  }, [clearAllNotifications]);

  // Memoized grouped notifications by priority for better UX
  const groupedNotifications = useMemo(() => {
    const groups = {
      high: [] as typeof notifications,
      medium: [] as typeof notifications,
      low: [] as typeof notifications,
    };

    notifications.forEach(notification => {
      groups[notification.priority].push(notification);
    });

    // Return flattened array with high priority first
    return [...groups.high, ...groups.medium, ...groups.low];
  }, [notifications]);

  // Memoized empty state
  const EmptyState = useMemo(() => (
    <div className="p-8 text-center">
      <Bell className="h-12 w-12 text-gray-300 mx-auto mb-4" />
      <p className="text-gray-500 font-medium">Nenhuma notificação</p>
      <p className="text-gray-400 text-sm mt-1">
        Você receberá notificações sobre pagamentos e atividades importantes
      </p>
    </div>
  ), []);

  // Reusable notification item component
  const NotificationItem = useCallback(({ 
    notification, 
    isMobile = false 
  }: { 
    notification: Notification; 
    isMobile?: boolean; 
  }) => (
    <div
      key={notification.id}
      className={`relative p-3 mb-2 rounded-2xl border-l-4 transition-all duration-200 hover:bg-gray-50 hover:shadow-sm ${
        notification.read
          ? "bg-gray-50 border-l-gray-200"
          : getPriorityColor(notification.priority)
      } ${!notification.read ? "border-l-4" : "border-l-gray-200"}`}
      role="listitem"
      aria-labelledby={`notification-title-${notification.id}`}
      aria-describedby={`notification-message-${notification.id}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1 min-w-0">
          <div className="flex-shrink-0 mt-1" aria-hidden="true">
            {getNotificationIcon(notification.type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h4
                id={`notification-title-${notification.id}`}
                className={`text-sm font-medium ${
                  notification.read
                    ? "text-gray-700"
                    : "text-gray-900"
                } truncate`}
              >
                {notification.title}
              </h4>
              <span 
                className="text-xs text-gray-500 ml-2 flex-shrink-0"
                title={notification.timestamp.toLocaleString('pt-BR')}
              >
                {formatTimestamp(notification.timestamp)}
              </span>
            </div>
            <p
              id={`notification-message-${notification.id}`}
              className={`text-sm mt-1 ${
                notification.read
                  ? "text-gray-600"
                  : "text-gray-700"
              } ${isMobile ? 'line-clamp-2' : ''}`}
            >
              {notification.message}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
          {!notification.read && (
            <button
              onClick={(e) => handleMarkAsRead(notification.id, e)}
              className="p-1 text-gray-400 hover:text-blue-600 transition-colors rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Marcar como lida"
              aria-label={`Marcar notificação "${notification.title}" como lida`}
            >
              <Check className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={(e) => handleClearNotification(notification.id, e)}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors rounded focus:outline-none focus:ring-2 focus:ring-red-500"
            title="Remover notificação"
            aria-label={`Remover notificação "${notification.title}"`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  ), [getNotificationIcon, getPriorityColor, formatTimestamp, handleMarkAsRead, handleClearNotification]);

  // Reusable notification list component
  const NotificationList = useCallback(({ 
    isMobile = false 
  }: { 
    isMobile?: boolean 
  }) => {
    if (groupedNotifications.length === 0) {
      return EmptyState;
    }

    return (
      <div className="p-2" role="list" aria-label="Lista de notificações">
        {groupedNotifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            isMobile={isMobile}
          />
        ))}
      </div>
    );
  }, [groupedNotifications, EmptyState, NotificationItem]);

  // Reusable header component
  const NotificationHeader = useCallback(() => (
    <div className="p-4 border-b border-gray-200 flex-shrink-0">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900" id="notifications-title">
            Notificações
          </h3>
          <p className="text-sm text-gray-600">
            {unreadCount > 0
              ? `${unreadCount} não lida${unreadCount > 1 ? "s" : ""}`
              : "Todas lidas"}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="text-xs text-blue-600 hover:text-blue-800 transition-colors p-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Marcar todas como lidas"
              aria-label="Marcar todas as notificações como lidas"
            >
              <Check className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={handleCloseDropdown}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded focus:outline-none focus:ring-2 focus:ring-gray-500"
            aria-label="Fechar notificações"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  ), [unreadCount, handleMarkAllAsRead, handleCloseDropdown]);

  // Reusable footer component
  const NotificationFooter = useCallback(() => {
    if (notifications.length === 0) return null;

    return (
      <div className="p-3 border-t border-gray-200 bg-gray-50 rounded-b-lg flex-shrink-0">
        <button
          onClick={handleClearAllNotifications}
          className="w-full text-sm text-red-600 hover:text-red-800 transition-colors py-1 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
          aria-label="Limpar todas as notificações"
        >
          Limpar todas as notificações
        </button>
      </div>
    );
  }, [notifications.length, handleClearAllNotifications]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Notification Bell Button */}
      <button
        ref={buttonRef}
        onClick={handleToggleDropdown}
        className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label={`Notificações${unreadCount > 0 ? ` (${unreadCount} não lidas)` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        disabled={isAnimating}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span 
            className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center animate-pulse"
            aria-hidden="true"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Mobile Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 sm:hidden" role="dialog" aria-modal="true" aria-labelledby="notifications-title">
          {/* Overlay with animation */}
          <div
            className={`fixed inset-0 bg-black transition-opacity duration-200 ${
              isAnimating ? 'opacity-0' : 'opacity-50'
            }`}
            onClick={handleCloseDropdown}
            aria-hidden="true"
          />

          {/* Modal Content with animation */}
          <div className={`fixed inset-x-2 top-12 bottom-12 bg-white rounded-2xl shadow-xl flex flex-col max-h-[calc(100vh-6rem)] transform transition-all duration-200 ${
            isAnimating ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
          }`}>
            {/* Header */}
            <NotificationHeader />

            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto">
              <NotificationList isMobile={true} />
            </div>

            {/* Footer */}
            <NotificationFooter />
          </div>
        </div>
      )}

      {/* Desktop Dropdown */}
      {isOpen && (
        <div className={`hidden sm:block absolute right-0 mt-2 w-96 bg-white rounded-2xl shadow-lg border border-gray-200 z-50 max-h-96 flex-col transform transition-all duration-200 ${
          isAnimating ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`} role="dialog" aria-modal="true" aria-labelledby="notifications-title">
          {/* Header */}
          <NotificationHeader />

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto">
            <NotificationList />
          </div>

          {/* Footer */}
          <NotificationFooter />
        </div>
      )}
    </div>
  );
};

export default NotificationDropdown;
