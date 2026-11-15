import { checkAccountSchema } from "../src/server/release/schema-contract";

try {
  const mode = await checkAccountSchema(process.env);
  console.log(`Preflight concluído: modo de conta ${mode}.`);
} catch {
  console.error(
    "Preflight falhou: verificar configuração pública, disponibilidade e migration 008.",
  );
  process.exitCode = 1;
}
