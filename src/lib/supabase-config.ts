// Configuração segura do Supabase
// Esta abordagem usa credenciais públicas seguras com RLS habilitado

export const getSupabaseConfig = () => {
  // Para aplicações frontend, o Supabase recomenda usar a chave anon pública
  // A segurança real vem do Row Level Security (RLS) configurado no banco
  
  const config = {
    url: 'https://rseiuknbwhmfjaiiywkj.supabase.co',
    // Esta é a chave anon pública - é seguro ser exposta quando RLS está configurado
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzZWl1a25id2htZmphaWl5d2tqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxODE5NTksImV4cCI6MjA2NTc1Nzk1OX0.52gF5pQq9HxD2fS893KHCjx1JfREx7HBAWyLA8LpbSE'
  };

  // Validações de segurança
  if (!config.url || !config.anonKey) {
    throw new Error('Configuração do Supabase incompleta');
  }

  return config;
};

// IMPORTANTE: 
// A chave anon é PÚBLICA e deve ser exposta no frontend
// A segurança vem do Row Level Security (RLS) configurado no Supabase
// Certifique-se de que as políticas RLS estão configuradas para proteger os dados