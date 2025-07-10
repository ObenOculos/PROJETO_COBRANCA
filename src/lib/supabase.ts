import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './supabase-config';

// Configuração segura do Supabase
const config = getSupabaseConfig();

// Validar se a URL do Supabase está formatada corretamente
try {
  new URL(config.url);
} catch (error) {
  throw new Error(`Formato inválido da URL do Supabase: "${config.url}"`);
}

export const supabase = createClient(config.url, config.anonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
});

// Testar a conexão silenciosamente
supabase.from('users').select('count', { count: 'exact', head: true })
  .then(({ count, error }) => {
    if (error) {
      console.error('Erro de conectividade com o banco de dados');
    }
    // Conexão OK - sem logs em produção
  });