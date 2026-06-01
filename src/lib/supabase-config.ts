// Configuração segura do Supabase
// Esta abordagem usa credenciais públicas seguras com RLS habilitado

export const getSupabaseConfig = () => {
  // Para aplicações frontend, o Supabase recomenda usar a chave anon pública
  // A segurança real vem do Row Level Security (RLS) configurado no banco

  // As credenciais são lidas das variáveis de ambiente do Vite (.env)
  const config = {
    url: import.meta.env.VITE_SUPABASE_URL,
    // Esta é a chave anon pública - é seguro ser exposta quando RLS está configurado
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  };

  // Validações de segurança
  if (!config.url || !config.anonKey) {
    throw new Error(
      "Configuração do Supabase incompleta. Verifique se VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY estão definidas no arquivo .env",
    );
  }

  return config;
};

// IMPORTANTE:
// A chave anon é PÚBLICA e deve ser exposta no frontend
// A segurança vem do Row Level Security (RLS) configurado no Supabase
// Certifique-se de que as políticas RLS estão configuradas para proteger os dados
