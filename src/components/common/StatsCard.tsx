import React from "react";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  iconColor?: string;
  onClick?: () => void;
}

const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
  iconColor = "bg-blue-500",
  onClick,
}) => {
  const getChangeColor = () => {
    switch (changeType) {
      case "positive":
        return "text-green-600";
      case "negative":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  return (
    <div
      className={`bg-white rounded-xl shadow-sm p-4 lg:p-6 border border-gray-100 hover:shadow-md transition-all ${
        onClick ? "cursor-pointer hover:scale-105 active:scale-95" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs lg:text-sm font-medium text-gray-600 truncate">
            {title}
          </p>
          <p className="text-lg lg:text-2xl font-bold text-gray-900 mt-1 lg:mt-2 truncate">
            {value}
          </p>
          {change && (
            <p
              className={`text-xs lg:text-sm mt-1 lg:mt-2 ${getChangeColor()} truncate`}
            >
              {change}
            </p>
          )}
        </div>
        <div
          className={`h-10 w-10 lg:h-12 lg:w-12 ${iconColor} rounded-lg flex items-center justify-center flex-shrink-0 ml-3`}
        >
          <Icon className="h-5 w-5 lg:h-6 lg:w-6 text-white" />
        </div>
      </div>
    </div>
  );
};

export default StatsCard;
