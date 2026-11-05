// Checagem de seguranca do banco (somente leitura). Uso: npm run check:db
// Falha (exit 1) se houver funcao do schema public:
//   - com guard "<> 'manager'" (NULL-unsafe: sessao sem login passa);
//   - executavel por anon fora da lista de login;
//   - SECURITY DEFINER sem search_path fixo.
import { readFileSync } from "node:fs";

const PROJECT_REF = "rseiuknbwhmfjaiiywkj";
const ANON_PERMITIDAS = ["resolve_auth_email", "app_current_user_id", "app_current_user_type"];

const token = readFileSync(new URL("../.env", import.meta.url), "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("SUPABASE_ACCESS_TOKEN="))
  ?.slice("SUPABASE_ACCESS_TOKEN=".length)
  .replace(/^"|"$/g, "");
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN ausente no .env");
  process.exit(2);
}

const lista = ANON_PERMITIDAS.map((n) => `'${n}'`).join(", ");
const query = `
  SELECT p.oid::regprocedure::text AS funcao, problema
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL (VALUES
    (CASE WHEN regexp_replace(pg_get_functiondef(p.oid), '--[^\\n]*', '', 'g') ~ '<>\\s*''manager'''
          THEN 'guard "<> manager" (use IS DISTINCT FROM)' END),
    (CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE') AND p.proname NOT IN (${lista})
          THEN 'executavel por anon' END),
    (CASE WHEN p.prosecdef AND NOT EXISTS (
            SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
          THEN 'SECURITY DEFINER sem search_path' END)
  ) v(problema)
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND problema IS NOT NULL
  ORDER BY 1, 2`;

const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, read_only: true }),
  },
);
const body = await res.json();
if (!res.ok || !Array.isArray(body)) {
  console.error("Falha na consulta:", body);
  process.exit(2);
}
if (body.length === 0) {
  console.log("OK: nenhuma funcao com problema de seguranca.");
} else {
  for (const r of body) console.log(`- ${r.funcao}: ${r.problema}`);
  console.error(`\n${body.length} problema(s) encontrado(s).`);
  process.exit(1);
}
