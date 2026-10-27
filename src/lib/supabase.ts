import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./supabase-config";
import { Database } from "../types/database.types";

// Configuração segura do Supabase
const config = getSupabaseConfig();

// Validar se a URL do Supabase está formatada corretamente
try {
  new URL(config.url);
} catch (error) {
  throw new Error(`Formato inválido da URL do Supabase: "${config.url}"`);
}

export const supabase = createClient<Database>(config.url, config.anonKey, {
  auth: {
    // Login passa pelo Supabase Auth (Etapa 1 da reorganização) — a sessão
    // precisa persistir e se renovar sozinha para sobreviver a reload/offline.
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
