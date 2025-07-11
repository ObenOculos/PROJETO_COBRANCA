import { supabase } from '../lib/supabase';

// Função para criar usuários no Supabase Auth
export async function createSupabaseUser(email: string, password: string, metadata: any) {
  try {
    // Criar usuário no Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: metadata // Nome, tipo de usuário, etc.
      }
    });

    if (error) {
      console.error('Erro ao criar usuário no Supabase:', error);
      return { success: false, error };
    }

    console.log('Usuário criado com sucesso:', data);
    return { success: true, data };
  } catch (err) {
    console.error('Erro inesperado:', err);
    return { success: false, error: err };
  }
}

// Exemplo de uso para migrar usuários existentes
export async function migrateExistingUsers() {
  // Buscar usuários da tabela local
  const { data: users, error } = await supabase
    .from('users')
    .select('*');

  if (error || !users) {
    console.error('Erro ao buscar usuários:', error);
    return;
  }

  for (const user of users) {
    // Criar email se não existir
    const email = user.login.includes('@') 
      ? user.login 
      : `${user.login.toLowerCase()}@sistema.local`;

    await createSupabaseUser(email, user.password, {
      name: user.name,
      type: user.type,
      original_login: user.login,
      user_id: user.id
    });
  }
}