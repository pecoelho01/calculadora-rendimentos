import { test } from "@playwright/test";

// Cada grupo E2E precisa de um build específico, assinalado por uma variável.
// No GitHub Actions a falta da variável é um erro de configuração do job: falhar
// evita que a suite fique verde com todos os testes saltados. Localmente, quem
// corre a suite com outro build continua a ver apenas testes saltados.
export function skipUnlessEnv(variable: string, requirement: string): void {
  if (process.env[variable]) return;

  const message = `${requirement} Definir ${variable}=1.`;
  if (process.env.GITHUB_ACTIONS) throw new Error(message);

  test.skip(true, message);
}
