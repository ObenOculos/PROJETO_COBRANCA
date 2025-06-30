// Script para verificar se as variáveis de ambiente estão sendo carregadas
console.log('🔍 Verificando variáveis de ambiente...');
console.log('VITE_SUPABASE_URL:', process.env.VITE_SUPABASE_URL);
console.log('VITE_SUPABASE_ANON_KEY:', process.env.VITE_SUPABASE_ANON_KEY ? 'DEFINIDA' : 'UNDEFINED');

// Ler arquivo .env diretamente
const fs = require('fs');
const path = require('path');

try {
  const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  console.log('\n📄 Conteúdo do arquivo .env:');
  console.log(envContent);
} catch (error) {
  console.error('❌ Erro ao ler arquivo .env:', error.message);
}