import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Configuração do Supabase carregada das variáveis de ambiente

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Variáveis de ambiente do Supabase não encontradas. Verifique seu arquivo .env');
}

// Validar se a URL do Supabase está formatada corretamente
try {
  new URL(supabaseUrl);
} catch (error) {
  throw new Error(`Formato inválido da VITE_SUPABASE_URL: "${supabaseUrl}". Certifique-se de que é uma URL válida começando com https:// (ex: https://your-project-ref.supabase.co)`);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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