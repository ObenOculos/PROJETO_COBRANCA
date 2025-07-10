import { useState } from "react";
import { supabase } from "../lib/supabase";

export function TestSupabase() {
  const [testResult, setTestResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const testConnection = async () => {
    setLoading(true);
    setTestResult("Testando conexão...");

    try {
      console.log("🧪 Testando conexão com Supabase...");

      // Verificar configuração
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      // Verificando configuração (sem expor dados sensíveis)
      console.log("📋 Verificando configuração do Supabase...");

      setTestResult(`🔧 Configuração:
URL: ${supabaseUrl ? "✅ Configurada" : "❌ UNDEFINED"}
Key: ${supabaseKey ? "✅ Configurada" : "❌ UNDEFINED"}

Testando conexão...`);

      // Teste 1: Verificar se consegue conectar
      const { data: testData, error: testError } = await supabase
        .from("BANCO_DADOS")
        .select("count", { count: "exact", head: true });

      if (testError) {
        setTestResult(`❌ Erro de conexão: ${testError.message}`);
        console.error("Erro de conexão:", testError);
        return;
      }

      setTestResult(`✅ Conexão OK! Total de registros: ${testData || 0}`);

      // Teste 2: Buscar alguns registros
      const { data: sampleData, error: sampleError } = await supabase
        .from("BANCO_DADOS")
        .select("id_parcela, cliente, documento, user_id")
        .limit(3);

      if (sampleError) {
        setTestResult(
          (prev) => prev + `\n❌ Erro ao buscar dados: ${sampleError.message}`,
        );
        return;
      }

      setTestResult(
        (prev) =>
          prev +
          `\n📋 Dados de exemplo: ${JSON.stringify(sampleData, null, 2)}`,
      );
    } catch (err) {
      console.error("Erro no teste:", err);
      setTestResult(`💥 Erro inesperado: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-blue-800">
          🧪 Teste de Conexão Supabase
        </h3>
        <button
          onClick={testConnection}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Testando..." : "Testar Conexão"}
        </button>
      </div>

      {testResult && (
        <pre className="bg-white p-3 rounded border text-xs whitespace-pre-wrap">
          {testResult}
        </pre>
      )}
    </div>
  );
}
