// components/RadialApprovalChart.tsx
import React from "react";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";

import { LucideIcon } from "lucide-react";

interface Props {
  value?: number; // Opcional: para casos onde a porcentagem já é conhecida (0 a 100)
  current?: number; // Valor atual para cálculo da porcentagem
  goal?: number; // Meta para cálculo da porcentagem
  title: string; // Título do gráfico
  showValues?: boolean; // Se deve mostrar os valores além da porcentagem
  isCurrency?: boolean; // Se os valores são monetários
  level?: { icon: LucideIcon; name: string; color: string; bgColor: string }; // Nível de performance
  motivationalMessage?: { text: string; icon: LucideIcon }; // Mensagem motivacional
}

const RadialApprovalChart: React.FC<Props> = ({
  value,
  current = 0,
  goal = 0,
  title,
  showValues = true,
  isCurrency = false,
  level,
  motivationalMessage,
}) => {
  const percentage =
    value !== undefined ? value : goal > 0 ? (current / goal) * 100 : 0;

  const formatValue = (val: number) => {
    if (isCurrency) {
      return val.toLocaleString("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    }
    return val.toFixed(0);
  };

  return (
    <div className="w-auto mx-auto flex flex-col items-center bg-gradient-to-br from-white to-gray-50 rounded-2xl p-4 border border-gray-200 hover:border-gray-300 transition-all duration-300">
      {/* Badge de nível */}
      {level && (
        <div
          className={`flex items-center gap-2 mb-2 px-2 py-1 rounded-full ${level.bgColor}`}
        >
          <level.icon className={`w-4 h-4 ${level.color}`} />
          <span className={`text-xs font-bold ${level.color}`}>
            {level.name}
          </span>
        </div>
      )}

      {/* Gráfico circular */}
      <div className="w-20 h-20 mb-2">
        <CircularProgressbar
          value={percentage}
          text={`${percentage.toFixed(0)}%`}
          styles={buildStyles({
            textSize: "16px",
            pathColor:
              percentage >= 100
                ? "#10b981"
                : percentage >= 70
                  ? "#22c55e"
                  : percentage >= 40
                    ? "#facc15"
                    : "#ef4444",
            textColor: "#111827",
            trailColor: "#e5e7eb",
            pathTransition: "stroke-dashoffset 0.5s ease 0s",
          })}
        />
      </div>

      {/* Informações */}
      <div className="text-center">
        <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
        {showValues && goal > 0 && (
          <p className="text-xs text-gray-500 font-medium">
            {formatValue(current)}/{formatValue(goal)}
          </p>
        )}
        {motivationalMessage && (
          <div className="flex items-center gap-1 text-xs text-blue-600 font-medium mt-1 px-2 py-1 bg-blue-50 rounded-full">
            <motivationalMessage.icon className="w-3 h-3" />
            {motivationalMessage.text}
          </div>
        )}
      </div>
    </div>
  );
};

export default RadialApprovalChart;
