// components/RadialApprovalChart.tsx
import React from "react";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";

interface Props {
  value?: number; // Opcional: para casos onde a porcentagem já é conhecida (0 a 100)
  current?: number; // Valor atual para cálculo da porcentagem
  goal?: number; // Meta para cálculo da porcentagem
  title: string; // Título do gráfico
  showValues?: boolean; // Se deve mostrar os valores além da porcentagem
  isCurrency?: boolean; // Se os valores são monetários
}

const RadialApprovalChart: React.FC<Props> = ({
  value,
  current = 0,
  goal = 0,
  title,
  showValues = true,
  isCurrency = false,
}) => {
  const percentage = value !== undefined ? value : (goal > 0 ? (current / goal) * 100 : 0);

  const formatValue = (val: number) => {
    if (isCurrency) {
      return val.toLocaleString('pt-BR', { 
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      });
    }
    return val.toFixed(0);
  };

  return (
    <div className="w-32 h-32 mx-auto flex flex-col justify-between">
      <CircularProgressbar
        value={percentage}
        text={`${percentage.toFixed(0)}%`}
        styles={buildStyles({
          textSize: "18px",
          pathColor: percentage >= 70 ? "#22c55e" : percentage >= 40 ? "#facc15" : "#ef4444", // verde, amarelo, vermelho
          textColor: "#111827",
          trailColor: "#e5e7eb", // cinza claro
        })}
      />
      <div className="text-center mt-2">
        <p className="text-xs font-medium text-gray-600">
          {title}
        </p>
        {showValues && goal > 0 && (
          <p className="text-xs text-gray-500 mt-1">
            {formatValue(current)}/{formatValue(goal)}
          </p>
        )}
      </div>
    </div>
  );
};

export default RadialApprovalChart;
