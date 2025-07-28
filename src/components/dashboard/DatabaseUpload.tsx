import React, { useState } from "react";
import { supabase } from "../../lib/supabase";
import { Modal } from "../Modal"; // Importar o componente Modal
import { useCollection } from "../../contexts/CollectionContext";
import {
  X,
  UploadCloud,
  CheckCircle,
  AlertCircle,
  Info,
  FileText,
  RefreshCcw,
} from "lucide-react"; // Importar ícones

interface FileData {
  [key: string]: string;
}

interface UpdateResult {
  id_parcela: string;
  status: "success" | "error";
  error?: string;
  details?: any;
}

interface InsertResult {
  success: boolean;
  message?: string;
  error?: string;
  details?: any;
  invalidRows?: FileData[];
}

const DatabaseUpload: React.FC = () => {
  const { refreshData } = useCollection();
  const [statusFile, setStatusFile] = useState<File | null>(null);
  const [newParcelaFile, setNewParcelaFile] = useState<File | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [debugInfo, setDebugInfo] = useState<string>("");

  // Estados para o modal de progresso
  const [showProgressModal, setShowProgressModal] = useState<boolean>(false);
  const [progressPercentage, setProgressPercentage] = useState<number>(0);
  const [progressMessage, setProgressMessage] = useState<string>("");

  const handleStatusFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (event.target.files) {
      setStatusFile(event.target.files[0]);
      setUploadStatus("");
      setDebugInfo("");
    }
  };

  const handleNewParcelaFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (event.target.files) {
      setNewParcelaFile(event.target.files[0]);
      setUploadStatus("");
      setDebugInfo("");
    }
  };

  const clearStatusFile = () => {
    setStatusFile(null);
    setUploadStatus("");
    setDebugInfo("");
    const input = document.getElementById(
      "statusFileInput",
    ) as HTMLInputElement;
    if (input) input.value = "";
  };

  const clearNewParcelaFile = () => {
    setNewParcelaFile(null);
    setUploadStatus("");
    setDebugInfo("");
    const input = document.getElementById(
      "newParcelaFileInput",
    ) as HTMLInputElement;
    if (input) input.value = "";
  };

  // Função para testar conexão com Supabase
  const testSupabaseConnection = async () => {
    try {
      // Testando conexão com o banco de dados...

      // Verificar se a tabela existe e conseguimos fazer uma query simples
      const { error, count } = await supabase
        .from("BANCO_DADOS")
        .select("*", { count: "exact", head: true });

      if (error) {
        console.error("Erro de conectividade com o banco de dados");
        setDebugInfo(`❌ Erro de conexão: ${error.message}`);
        return false;
      }
      setDebugInfo(`✅ Conexão OK. ${count} registros na tabela BANCO_DADOS`);
      return true;
    } catch (error) {
      console.error("❌ Erro de conexão:", error);
      setDebugInfo(`❌ Erro: ${(error as Error).message}`);
      return false;
    }
  };

  // Função para processar arquivo CSV/Excel
  const processFile = async (file: File): Promise<FileData[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e: ProgressEvent<FileReader>) => {
        try {
          const text = e.target?.result as string;
          if (!text || text.trim() === "") {
            return reject(new Error("Arquivo CSV está vazio"));
          }

          const isCSV = file.name.toLowerCase().endsWith(".csv");
          if (!isCSV) {
            return reject(
              new Error("Formato Excel não implementado. Use CSV."),
            );
          }

          console.log("📄 Processando CSV com parser robusto...");

          // Detectar separador
          const firstLine = text.substring(0, text.indexOf("\n"));
          let separator = ",";
          if (firstLine.includes(";") && !firstLine.includes(","))
            separator = ";";
          else if (firstLine.includes("\t")) separator = "\t";
          console.log(`🔍 Separador detectado: "${separator}"`);

          const rows = [];
          let currentField = "";
          let currentRow = [];
          let inQuotedField = false;

          for (let i = 0; i < text.length; i++) {
            const char = text[i];

            if (inQuotedField) {
              if (char === '"') {
                // Verifica se é uma aspa de escape (duas aspas)
                if (i + 1 < text.length && text[i + 1] === '"') {
                  currentField += '"';
                  i++; // Pula a próxima aspa
                } else {
                  inQuotedField = false;
                }
              } else {
                currentField += char;
              }
            } else {
              if (char === '"') {
                inQuotedField = true;
              } else if (char === separator) {
                currentRow.push(currentField);
                currentField = "";
              } else if (char === "\n" || char === "\r") {
                // Fim da linha
                if (text[i - 1] !== "\r" || char !== "\n") {
                  // Lida com \r\n
                  currentRow.push(currentField);
                  rows.push(currentRow);
                  currentRow = [];
                  currentField = "";
                }
                if (char === "\r" && text[i + 1] === "\n") {
                  i++; // Pula o \n
                }
              } else {
                currentField += char;
              }
            }
          }
          // Adiciona o último campo e linha se houver
          currentRow.push(currentField);
          rows.push(currentRow);

          if (rows.length < 2) {
            return reject(
              new Error(
                "CSV não contém dados suficientes (cabeçalho + pelo menos uma linha).",
              ),
            );
          }

          const headers = rows[0].map((h) => h.trim());
          console.log("📋 Headers encontrados:", headers);

          const data: FileData[] = [];
          for (let i = 1; i < rows.length; i++) {
            const values = rows[i];
            // Ignora linhas em branco que podem ter sido adicionadas no final
            if (values.length === 1 && values[0] === "") continue;

            if (values.length >= headers.length) {
              const row: FileData = {};
              headers.forEach((header, index) => {
                row[header] = values[index] || "";
              });
              data.push(row);
            } else {
              console.log(
                `⚠️ Linha ${i + 1} ignorada (número de colunas incompatível com o cabeçalho):`,
                values,
              );
            }
          }

          console.log(`✅ ${data.length} registros processados`);
          resolve(data);
        } catch (error) {
          console.error("❌ Erro ao processar arquivo:", error);
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
      reader.readAsText(file);
    });
  };

  // Função para verificar se registro existe
  const checkRecordExists = async (idParcela: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from("BANCO_DADOS")
        .select("id_parcela")
        .eq("id_parcela", idParcela)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows found
        console.error(`❌ Erro ao verificar registro ${idParcela}:`, error);
        return false;
      }

      const exists = !!data;
      console.log(
        `🔍 Registro ${idParcela} ${exists ? "existe" : "não existe"}`,
      );
      return exists;
    } catch (error) {
      console.error(`❌ Erro ao verificar registro ${idParcela}:`, error);
      return false;
    }
  };

  // Função para atualizar status no Supabase
  const updateStatusInSupabase = async (
    data: FileData[],
    onProgress?: (percentage: number, message: string) => void,
  ): Promise<UpdateResult[]> => {
    const updates: UpdateResult[] = [];

    console.log(`🔄 Iniciando atualização de ${data.length} registros...`);

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const idParcela = row.id_parcela || row["id_parcela"];
      const status = row.status || row["status"];

      console.log(`📝 Processando: ID=${idParcela}, Status=${status}`);

      if (!idParcela) {
        updates.push({
          id_parcela: "N/A",
          status: "error",
          error: "id_parcela não fornecido",
        });
        continue;
      }

      if (!status) {
        updates.push({
          id_parcela: idParcela,
          status: "error",
          error: "status não fornecido",
        });
        continue;
      }

      try {
        // Verificar se o registro existe primeiro
        const exists = await checkRecordExists(idParcela);
        if (!exists) {
          updates.push({
            id_parcela: idParcela,
            status: "error",
            error: `Registro com id_parcela ${idParcela} não encontrado`,
          });
          continue;
        }

        console.log(`🔄 Atualizando ${idParcela} com status: ${status}`);

        const { data: updateData, error } = await supabase
          .from("BANCO_DADOS")
          .update({ status: status })
          .eq("id_parcela", idParcela)
          .select(); // Adicionar select para ver o que foi atualizado

        if (error) {
          console.error(`❌ Erro ao atualizar ${idParcela}:`, error);
          updates.push({
            id_parcela: idParcela,
            status: "error",
            error: error.message,
            details: error,
          });
        } else {
          console.log(`✅ Sucesso ao atualizar ${idParcela}:`, updateData);
          updates.push({
            id_parcela: idParcela,
            status: "success",
            details: updateData,
          });
        }
      } catch (error) {
        console.error(`❌ Exceção ao atualizar ${idParcela}:`, error);
        updates.push({
          id_parcela: idParcela,
          status: "error",
          error: (error as Error).message,
        });
      }
      if (onProgress) {
        const percentage = Math.round(((i + 1) / data.length) * 100);
        onProgress(
          percentage,
          `Atualizando registro ${i + 1} de ${data.length}...`,
        );
      }
    }

    return updates;
  };

  // Função para inserir novas parcelas no Supabase
  const insertNewParcelasInSupabase = async (
    data: FileData[],
    onProgress?: (percentage: number, message: string) => void,
  ): Promise<InsertResult> => {
    try {
      const validData = data.filter(
        (row) => row.id_parcela && row.id_parcela.trim() !== "",
      );
      const invalidRows = data.filter(
        (row) => !row.id_parcela || row.id_parcela.trim() === "",
      );
      const invalidRowsCount = invalidRows.length;

      if (invalidRowsCount > 0) {
        console.warn(
          `[DataUpload] Ignorando ${invalidRowsCount} linhas por não terem um id_parcela válido.`,
        );
      }

      console.log(`🔄 Inserindo ${validData.length} novos registros...`);
      console.log("📄 Dados a serem inseridos:", validData);

      // Dividir os dados em chunks para inserção em lote, se necessário
      const chunkSize = 1000; // Exemplo: inserir 1000 registros por vez
      let successfulInserts = 0;

      for (let i = 0; i < validData.length; i += chunkSize) {
        const chunk = validData.slice(i, i + chunkSize);

        // Mapear e converter tipos para o chunk
        const processedChunk = chunk.map((row) => {
          const newRow: { [key: string]: any } = { ...row };
          // Converter campos bigint para número ou null se vazio
          newRow.dias_em_atraso = newRow.dias_em_atraso
            ? Number(newRow.dias_em_atraso)
            : null;
          newRow.numero_titulo = newRow.numero_titulo
            ? Number(newRow.numero_titulo)
            : null;
          newRow.parcela = newRow.parcela ? Number(newRow.parcela) : null;
          newRow.id_parcela = Number(row.id_parcela); // Convertido com segurança após a filtragem
          newRow.venda_n = newRow.venda_n ? Number(newRow.venda_n) : null;

          // Converter valores monetários para número ou null se vazio
          newRow.valor_original = newRow.valor_original
            ? Number(newRow.valor_original.replace(",", "."))
            : null;
          newRow.valor_reajustado = newRow.valor_reajustado
            ? Number(newRow.valor_reajustado.replace(",", "."))
            : null;
          newRow.multa = newRow.multa
            ? Number(newRow.multa.replace(",", "."))
            : null;
          newRow.juros_por_dia = newRow.juros_por_dia
            ? Number(newRow.juros_por_dia.replace(",", "."))
            : null;
          newRow.multa_aplicada = newRow.multa_aplicada
            ? Number(newRow.multa_aplicada.replace(",", "."))
            : null;
          newRow.juros_aplicado = newRow.juros_aplicado
            ? Number(newRow.juros_aplicado.replace(",", "."))
            : null;
          newRow.valor_recebido = newRow.valor_recebido
            ? Number(newRow.valor_recebido.replace(",", "."))
            : null;
          newRow.desconto = newRow.desconto
            ? Number(newRow.desconto.replace(",", "."))
            : null;
          newRow.acrescimo = newRow.acrescimo
            ? Number(newRow.acrescimo.replace(",", "."))
            : null;
          newRow.multa_paga = newRow.multa_paga
            ? Number(newRow.multa_paga.replace(",", "."))
            : null;
          newRow.juros_pago = newRow.juros_pago
            ? Number(newRow.juros_pago.replace(",", "."))
            : null;
          if (newRow.user_id === "") newRow.user_id = null;

          return newRow;
        });

        const { error } = await supabase
          .from("BANCO_DADOS")
          .insert(processedChunk)
          .select(); // Adicionar select para ver o que foi inserido

        if (error) {
          console.error("❌ Erro ao inserir dados:", error);
          return {
            success: false,
            error: error.message,
            details: error,
          };
        }
        successfulInserts += chunk.length;
        if (onProgress) {
          const percentage = Math.round(
            (successfulInserts / validData.length) * 100,
          );
          onProgress(
            percentage,
            `Inserindo ${successfulInserts} de ${validData.length} novos registros...`,
          );
        }
      }

      let message = `${successfulInserts} parcelas inseridas com sucesso`;
      if (invalidRowsCount > 0) {
        message += `. ${invalidRowsCount} linhas foram ignoradas. Veja os detalhes no debug.`;
      }

      console.log("✅ Dados inseridos com sucesso:", successfulInserts);
      return {
        success: true,
        message: message,
        details: null,
        invalidRows: invalidRows,
      };
    } catch (error) {
      console.error("❌ Exceção ao inserir dados:", error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  };

  const handleUploadStatus = async () => {
    if (!statusFile) {
      alert("Por favor, selecione um arquivo para atualizar o status.");
      return;
    }

    setLoading(true);
    setShowProgressModal(true);
    setProgressPercentage(0);
    setProgressMessage("Iniciando atualização...");
    setUploadStatus("");
    setDebugInfo("");

    try {
      setProgressMessage("🔍 Testando conexão com Supabase...");
      const connectionOk = await testSupabaseConnection();
      if (!connectionOk) {
        setProgressMessage("❌ Falha na conexão com Supabase");
        setUploadStatus("❌ Falha na conexão com Supabase");
        return;
      }

      setProgressMessage("📤 Processando arquivo...");
      setProgressPercentage(20);
      const data = await processFile(statusFile);
      setProgressMessage(
        `📋 ${data.length} registros encontrados. Atualizando no Supabase...`,
      );
      setProgressPercentage(40);

      const results = await updateStatusInSupabase(
        data,
        (percentage, message) => {
          setProgressPercentage(40 + percentage * 0.6); // 40% para processamento, 60% para upload
          setProgressMessage(message);
        },
      );

      const successful = results.filter((r) => r.status === "success").length;
      const failed = results.filter((r) => r.status === "error").length;

      setUploadStatus(
        `✅ Atualização concluída: ${successful} sucessos, ${failed} falhas`,
      );
      setProgressMessage(
        `✅ Atualização concluída: ${successful} sucessos, ${failed} falhas`,
      );
      setProgressPercentage(100);

      if (failed > 0) {
        console.log(
          "❌ Erros encontrados:",
          results.filter((r) => r.status === "error"),
        );
        const errorDetails = results
          .filter((r) => r.status === "error")
          .map((r) => `${r.id_parcela}: ${r.error}`)
          .join("\n");
        setDebugInfo(`❌ Erros:\n${errorDetails}`);
      } else {
        setDebugInfo("✅ Todas as atualizações foram realizadas com sucesso!");
      }

      // Refresh dos dados após atualização bem-sucedida
      if (successful > 0) {
        setProgressMessage("🔄 Atualizando dados na interface...");
        await refreshData();
        setProgressMessage("✅ Dados atualizados na interface!");
      }
    } catch (error) {
      const errorMsg = (error as Error).message;
      setUploadStatus(`❌ Erro: ${errorMsg}`);
      setDebugInfo(`❌ Erro detalhado: ${errorMsg}`);
      setProgressMessage(`❌ Erro: ${errorMsg}`);
      setProgressPercentage(0);
      console.error("❌ Erro detalhado:", error);
    } finally {
      setLoading(false);
      // Manter o modal aberto por um breve período para o usuário ver o status final
      setTimeout(() => setShowProgressModal(false), 3000);
    }
  };

  const handleUploadNewParcela = async () => {
    if (!newParcelaFile) {
      alert("Por favor, selecione um arquivo para adicionar novas parcelas.");
      return;
    }

    setLoading(true);
    setShowProgressModal(true);
    setProgressPercentage(0);
    setProgressMessage("Iniciando inserção de novas parcelas...");
    setUploadStatus("");
    setDebugInfo("");

    try {
      setProgressMessage("🔍 Testando conexão com Supabase...");
      const connectionOk = await testSupabaseConnection();
      if (!connectionOk) {
        setProgressMessage("❌ Falha na conexão com Supabase");
        setUploadStatus("❌ Falha na conexão com Supabase");
        return;
      }

      setProgressMessage("📤 Processando arquivo...");
      setProgressPercentage(20);
      const data = await processFile(newParcelaFile);
      setProgressMessage(
        `📋 ${data.length} registros encontrados. Inserindo no Supabase...`,
      );
      setProgressPercentage(40);

      const result = await insertNewParcelasInSupabase(
        data,
        (percentage, message) => {
          setProgressPercentage(40 + percentage * 0.6); // 40% para processamento, 60% para upload
          setProgressMessage(message);
        },
      );

      if (result.success) {
        setUploadStatus(`✅ ${result.message}`);
        setProgressMessage(`✅ ${result.message}`);
        setProgressPercentage(100);

        if (result.invalidRows && result.invalidRows.length > 0) {
          const invalidRowsInfo = result.invalidRows
            .map((row) => JSON.stringify(row))
            .join("\n");
          setDebugInfo(
            `✅ Inserção concluída, mas ${result.invalidRows.length} linhas foram ignoradas por falta de id_parcela:\n${invalidRowsInfo}`,
          );
        } else {
          setDebugInfo(
            "✅ Todas as novas parcelas foram inseridas com sucesso!",
          );
        }

        // Refresh dos dados após inserção bem-sucedida
        setProgressMessage("🔄 Atualizando dados na interface...");
        await refreshData();
        setProgressMessage("✅ Dados atualizados na interface!");
      } else {
        setUploadStatus(`❌ Erro: ${result.error}`);
        setDebugInfo(`❌ Erro detalhado: ${result.error}`);
        setProgressMessage(`❌ Erro: ${result.error}`);
        setProgressPercentage(0);
      }
    } catch (error) {
      const errorMsg = (error as Error).message;
      setUploadStatus(`❌ Erro: ${errorMsg}`);
      setDebugInfo(`❌ Erro detalhado: ${errorMsg}`);
      setProgressMessage(`❌ Erro: ${errorMsg}`);
      setProgressPercentage(0);
      console.error("❌ Erro detalhado:", error);
    } finally {
      setLoading(false);
      // Manter o modal aberto por um breve período para o usuário ver o status final
      setTimeout(() => setShowProgressModal(false), 3000);
    }
  };

  return (
    <div className="bg-white rounded-2xl sm:rounded-2xl shadow-sm p-4 sm:p-6 border border-gray-200 space-y-6">
      <h2 className="text-xl lg:text-2xl font-bold text-gray-900 flex items-center-title">
        Upload de Dados do Banco
      </h2>
      <p className="text-sm text-gray-600 mt-1 hidden sm:block">
        Utilize esta seção para atualizar informações existentes ou adicionar
        novos registros à tabela BANCO_DADOS.
      </p>

      {/* Botão de teste de conexão */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-yellow-800 flex items-center">
          <Info className="h-4 w-4 mr-2" />
          🔧 Debug e Teste
        </h3>
        <button
          onClick={testSupabaseConnection}
          disabled={loading}
          className="inline-flex items-center px-3 py-2 border border-yellow-300 text-sm font-medium rounded-md text-yellow-700 bg-yellow-50 hover:bg-yellow-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50"
        >
          <RefreshCcw className="h-4 w-4 mr-2" /> Testar Conexão com Supabase
        </button>
      </div>

      {/* Status do upload */}
      {uploadStatus && (
        <div
          className={`p-4 rounded-2xl flex items-center ${
            uploadStatus.includes("❌")
              ? "bg-red-50 text-red-700"
              : uploadStatus.includes("✅")
                ? "bg-green-50 text-green-700"
                : "bg-blue-50 text-blue-700"
          }`}
        >
          {uploadStatus.includes("❌") && (
            <AlertCircle className="h-5 w-5 mr-3" />
          )}
          {uploadStatus.includes("✅") && (
            <CheckCircle className="h-5 w-5 mr-3" />
          )}
          {uploadStatus.includes("🔄") && (
            <RefreshCcw className="h-5 w-5 mr-3 animate-spin" />
          )}
          {!uploadStatus.includes("❌") &&
            !uploadStatus.includes("✅") &&
            !uploadStatus.includes("🔄") && <Info className="h-5 w-5 mr-3" />}
          <span>{uploadStatus}</span>
        </div>
      )}

      {/* Debug info */}
      {debugInfo && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
          <h4 className="text-sm font-medium text-gray-800 mb-2 flex items-center">
            <FileText className="h-4 w-4 mr-2" />
            🐛 Informações de Debug:
          </h4>
          <pre className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-100 p-3 rounded-md overflow-auto max-h-40">
            {debugInfo}
          </pre>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Upload para atualizar status */}
        <div className="border border-gray-200 rounded-2xl p-4 space-y-3">
          <h3 className="text-lg font-medium text-gray-800 flex items-center">
            <UploadCloud className="h-5 w-5 mr-2" />
            Atualizar Status de Parcelas
          </h3>
          <p className="text-sm text-gray-600">
            Faça upload de um arquivo CSV com as colunas:{" "}
            <code className="bg-gray-100 px-1 rounded">id_parcela,status</code>
          </p>
          <div className="bg-blue-50 border-l-4 border-blue-400 p-3 text-sm flex items-start">
            <Info className="h-5 w-5 mr-3 text-blue-700 flex-shrink-0" />
            <div>
              <strong>Importante:</strong> O <code>id_parcela</code> deve
              corresponder a um registro existente na tabela. Apenas o campo{" "}
              <code>status</code> será atualizado.
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="file"
              accept=".csv"
              onChange={handleStatusFileChange}
              disabled={loading}
              id="statusFileInput"
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100
                disabled:opacity-50"
            />
            {statusFile && (
              <button
                onClick={clearStatusFile}
                className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                title="Limpar arquivo selecionado"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          <button
            onClick={handleUploadStatus}
            disabled={loading || !statusFile}
            className="mt-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <RefreshCcw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <UploadCloud className="h-4 w-4 mr-2" />
            )}
            {loading ? "Processando..." : "Upload para Atualizar Status"}
          </button>
          {statusFile && (
            <p className="text-sm text-gray-500 mt-2">
              Arquivo selecionado:{" "}
              <span className="font-medium">{statusFile.name}</span>
            </p>
          )}
        </div>

        {/* Upload para adicionar novas parcelas */}
        <div className="border border-gray-200 rounded-2xl p-4 space-y-3">
          <h3 className="text-lg font-medium text-gray-800 flex items-center">
            <UploadCloud className="h-5 w-5 mr-2" />
            Adicionar Novas Parcelas
          </h3>
          <p className="text-sm text-gray-600">
            Faça upload de um arquivo CSV contendo os dados das novas parcelas a
            serem adicionadas.
          </p>
          <div className="flex items-center space-x-2">
            <input
              type="file"
              accept=".csv"
              onChange={handleNewParcelaFileChange}
              disabled={loading}
              id="newParcelaFileInput"
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-green-50 file:text-green-700
                hover:file:bg-green-100
                disabled:opacity-50"
            />
            {newParcelaFile && (
              <button
                onClick={clearNewParcelaFile}
                className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                title="Limpar arquivo selecionado"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          <button
            onClick={handleUploadNewParcela}
            disabled={loading || !newParcelaFile}
            className="mt-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <RefreshCcw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <UploadCloud className="h-4 w-4 mr-2" />
            )}
            {loading
              ? "Processando..."
              : "Upload para Adicionar Novas Parcelas"}
          </button>
          {newParcelaFile && (
            <p className="text-sm text-gray-500 mt-2">
              Arquivo selecionado:{" "}
              <span className="font-medium">{newParcelaFile.name}</span>
            </p>
          )}
        </div>
      </div>

      {/* Instruções de uso */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start">
        <Info className="h-5 w-5 mr-3 text-blue-700 flex-shrink-0" />
        <div>
          <h3 className="text-sm font-medium text-blue-800 mb-2">Como usar:</h3>
          <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
            <li>
              Primeiro, teste a conexão com o Supabase usando o botão de teste
            </li>
            <li>
              Certifique-se de que as variáveis de ambiente do Supabase estão
              configuradas
            </li>
            <li>Prepare seu arquivo CSV com o formato correto</li>
            <li>Selecione o arquivo e clique em upload</li>
            <li>Acompanhe o status da operação e as informações de debug</li>
          </ol>
        </div>
      </div>

      {/* Modal de Progresso */}
      <Modal
        isOpen={showProgressModal}
        onClose={() => setShowProgressModal(false)}
        title="Progresso da Atualização"
      >
        <div className="text-center p-4">
          <p className="text-lg font-medium mb-4 text-gray-800">
            {progressMessage}
          </p>
          <div className="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700">
            <div
              className="bg-blue-600 h-4 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            {progressPercentage}% Concluído
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default DatabaseUpload;
