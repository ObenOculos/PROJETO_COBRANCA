import React, { useState, useRef, useEffect } from "react";
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

const NotificationDropdown: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAllNotifications,
  } = useNotifications();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "payment":
        return <DollarSign className="h-4 w-4 text-green-600" />;
      case "overdue":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case "assignment":
        return <Users className="h-4 w-4 text-blue-600" />;
      case "visit":
        return <Clock className="h-4 w-4 text-orange-600" />;
      default:
        return <Settings className="h-4 w-4 text-gray-600" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "border-l-red-500 bg-red-50";
      case "medium":
        return "border-l-yellow-500 bg-yellow-50";
      default:
        return "border-l-blue-500 bg-blue-50";
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Agora";
    if (minutes < 60) return `${minutes}m atrás`;
    if (hours < 24) return `${hours}h atrás`;
    return `${days}d atrás`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Notification Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Mobile Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 sm:hidden">
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50"
            onClick={() => setIsOpen(false)}
          />

          {/* Modal Content */}
          <div className="fixed inset-x-4 top-20 bottom-20 bg-white rounded-lg shadow-xl flex flex-col max-h-[calc(100vh-10rem)]">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
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
                      onClick={markAllAsRead}
                      className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                      title="Marcar todas como lidas"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">Nenhuma notificação</p>
                </div>
              ) : (
                <div className="p-2">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`relative p-3 mb-2 rounded-lg border-l-4 transition-colors hover:bg-gray-50 ${
                        notification.read
                          ? "bg-gray-50"
                          : getPriorityColor(notification.priority)
                      } ${!notification.read ? "border-l-4" : "border-l-gray-200"}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3 flex-1 min-w-0">
                          <div className="flex-shrink-0 mt-1">
                            {getNotificationIcon(notification.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h4
                                className={`text-sm font-medium ${
                                  notification.read
                                    ? "text-gray-700"
                                    : "text-gray-900"
                                } truncate`}
                              >
                                {notification.title}
                              </h4>
                              <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                                {formatTimestamp(notification.timestamp)}
                              </span>
                            </div>
                            <p
                              className={`text-sm mt-1 ${
                                notification.read
                                  ? "text-gray-600"
                                  : "text-gray-700"
                              }`}
                            >
                              {notification.message}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
                          {!notification.read && (
                            <button
                              onClick={() => markAsRead(notification.id)}
                              className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                              title="Marcar como lida"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            onClick={() => clearNotification(notification.id)}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                            title="Remover notificação"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="p-3 border-t border-gray-200 bg-gray-50 rounded-b-lg flex-shrink-0">
                <button
                  onClick={clearAllNotifications}
                  className="w-full text-sm text-red-600 hover:text-red-800 transition-colors"
                >
                  Limpar todas as notificações
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Desktop Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 flex flex-col sm:flex">
          {/* Header */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
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
                    onClick={markAllAsRead}
                    className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                    title="Marcar todas como lidas"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Nenhuma notificação</p>
              </div>
            ) : (
              <div className="p-2">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`relative p-3 mb-2 rounded-lg border-l-4 transition-colors hover:bg-gray-50 ${
                      notification.read
                        ? "bg-gray-50"
                        : getPriorityColor(notification.priority)
                    } ${!notification.read ? "border-l-4" : "border-l-gray-200"}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3 flex-1 min-w-0">
                        <div className="flex-shrink-0 mt-1">
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4
                              className={`text-sm font-medium ${
                                notification.read
                                  ? "text-gray-700"
                                  : "text-gray-900"
                              } truncate`}
                            >
                              {notification.title}
                            </h4>
                            <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                              {formatTimestamp(notification.timestamp)}
                            </span>
                          </div>
                          <p
                            className={`text-sm mt-1 ${
                              notification.read
                                ? "text-gray-600"
                                : "text-gray-700"
                            }`}
                          >
                            {notification.message}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
                        {!notification.read && (
                          <button
                            onClick={() => markAsRead(notification.id)}
                            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                            title="Marcar como lida"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          onClick={() => clearNotification(notification.id)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          title="Remover notificação"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
              <button
                onClick={clearAllNotifications}
                className="w-full text-sm text-red-600 hover:text-red-800 transition-colors"
              >
                Limpar todas as notificações
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationDropdown;
