import { checkAccountSchema } from "../src/server/release/schema-contract";

async function main(): Promise<number> {
  const strictProductionMode = process.argv.includes("--strict-production");
  const checkName = strictProductionMode
    ? "Verificação de produção"
    : "Preflight";

  const hasUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  const hasPublishableKey = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );

  if (strictProductionMode && (!hasUrl || !hasPublishableKey)) {
    console.error(
      "Verificação de produção falhou: configurar as duas variáveis públicas Supabase.",
    );
    return 1;
  }

  try {
    const mode = await checkAccountSchema(process.env);
    console.log(`Preflight concluído: modo de conta ${mode}.`);
    return 0;
  } catch {
    console.error(
      `${checkName} falhou: verificar configuração pública, disponibilidade e a migration exigida pelo contrato.`,
    );
    return 1;
  }
}

process.exitCode = await main();
