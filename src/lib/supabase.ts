import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('Configuração do Supabase:', { 
  url: supabaseUrl, 
  key: supabaseAnonKey ? `${supabaseAnonKey.substring(0, 20)}...` : 'undefined' 
});

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

// Testar a conexão
supabase.from('users').select('count', { count: 'exact', head: true })
  .then(({ count, error }) => {
    if (error) {
      console.error('Teste de conexão do Supabase falhou:', error);
    } else {
      console.log('Supabase conectado com sucesso. Contagem de usuários:', count);
    }
  });