// Etapa 1 da reorganização (auth) — cria no Supabase Auth um usuário para
// cada linha de public.users que ainda não tem auth_user_id, copiando a
// senha atual (texto puro, lida só nesta execução local, nunca impressa).
//
// Roda local, nunca no navegador. Usa a service_role key (acesso total,
// ignora RLS) — por isso NUNCA deve ter prefixo VITE_ no .env, senão o Vite
// embute no bundle do cliente.
//
// Uso:
//   node --env-file=.env scripts/migrate-users-to-auth.mjs            (dry-run, não escreve nada)
//   node --env-file=.env scripts/migrate-users-to-auth.mjs --apply    (cria de verdade)
//
// Idempotente: pula quem já tem auth_user_id preenchido.

import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

const url = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Faltam VITE_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env.\n" +
      "A service_role key fica em Supabase Dashboard → Settings → API → service_role.\n" +
      "NUNCA prefixe com VITE_ (seria embutida no bundle do front).",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL_DOMAIN = "collectors.internal";

/** login -> local-part de e-mail determinístico (sem acento/espaço). */
function slugifyLogin(login) {
  return login
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildSyntheticEmail(login, usedEmails) {
  const base = slugifyLogin(login) || "usuario";
  let email = `${base}@${EMAIL_DOMAIN}`;
  let suffix = 2;
  while (usedEmails.has(email)) {
    email = `${base}-${suffix}@${EMAIL_DOMAIN}`;
    suffix += 1;
  }
  usedEmails.add(email);
  return email;
}

async function main() {
  const { data: users, error } = await supabase
    .from("users")
    .select("id, name, login, password, type, active, auth_user_id")
    .order("id");

  if (error) {
    console.error("Erro ao ler public.users:", error.message);
    process.exit(1);
  }

  // Pré-popula com e-mails já usados por quem já migrou, pra não colidir.
  const usedEmails = new Set(
    users.filter((u) => u.auth_email).map((u) => u.auth_email),
  );

  const pending = users.filter((u) => !u.auth_user_id);
  const alreadyDone = users.length - pending.length;

  console.log(
    `${users.length} usuários no total. ${alreadyDone} já migrados. ${pending.length} pendentes.\n`,
  );

  if (pending.length === 0) {
    console.log("Nada a fazer.");
    return;
  }

  const plan = pending.map((u) => ({
    id: u.id,
    login: u.login,
    type: u.type,
    active: u.active,
    auth_email: buildSyntheticEmail(u.login, usedEmails),
  }));

  console.log("Plano (login -> e-mail sintético que será criado no Auth):");
  for (const p of plan) {
    console.log(
      `  ${p.login.padEnd(20)} -> ${p.auth_email}  [${p.type}${p.active ? "" : ", INATIVO"}]`,
    );
  }

  if (!APPLY) {
    console.log(
      "\nModo dry-run (padrão). Nenhuma escrita foi feita. Revise o plano acima e rode de novo com --apply para executar.",
    );
    return;
  }

  console.log("\nAplicando — criando usuários no Supabase Auth...\n");

  let ok = 0;
  let fail = 0;
  for (const p of plan) {
    const original = pending.find((u) => u.id === p.id);
    const { data: created, error: createError } =
      await supabase.auth.admin.createUser({
        email: p.auth_email,
        password: original.password,
        email_confirm: true,
        user_metadata: { legacy_user_id: p.id, legacy_login: p.login },
      });

    if (createError) {
      console.error(`  FALHOU  ${p.login}: ${createError.message}`);
      fail += 1;
      continue;
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({ auth_user_id: created.user.id, auth_email: p.auth_email })
      .eq("id", p.id);

    if (updateError) {
      console.error(
        `  CRIADO NO AUTH MAS FALHOU AO VINCULAR  ${p.login}: ${updateError.message}`,
      );
      fail += 1;
      continue;
    }

    console.log(`  OK      ${p.login}`);
    ok += 1;
  }

  console.log(`\nConcluído: ${ok} criados/vinculados, ${fail} com erro.`);
}

main();
