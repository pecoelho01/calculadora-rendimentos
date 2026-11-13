import { execFileSync, spawnSync } from "node:child_process";
import { isAbsolute } from "node:path";
import { getFileInfo } from "prettier";

// Git emits NUL-separated names; never interpret filenames as shell commands.
const base = process.env.FORMAT_BASE;
const head = process.env.FORMAT_HEAD || "HEAD";
if (!base || !/^[a-f0-9]{40}$/.test(base) || !/^[a-f0-9]{40}$/.test(head)) {
  throw new Error("FORMAT_BASE e FORMAT_HEAD devem ser SHAs completos.");
}
// A newly created branch has no previous revision to compare.
if (/^0{40}$/.test(base)) {
  console.log(
    "Formatação incremental ignorada: primeiro push sem revisão anterior.",
  );
  process.exit(0);
}
const names = execFileSync(
  "/usr/bin/git",
  ["diff", "--name-only", "--diff-filter=ACMR", "-z", base, head, "--"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const files = [];
for (const name of names) {
  const info = await getFileInfo(name, { ignorePath: ".prettierignore" });
  if (!info.ignored && info.inferredParser) files.push(`./${name}`);
}
if (files.length) {
  // npm supplies its absolute CLI path when invoked through the package script.
  // Reuse the running Node executable rather than searching PATH for npm/node.
  const npmCli = process.env.npm_execpath;
  if (!npmCli || !isAbsolute(npmCli)) {
    throw new Error("Executar através de npm run format:check:changed.");
  }
  const result = spawnSync(
    process.execPath,
    [npmCli, "run", "format:check", "--", ...files],
    { stdio: "inherit", shell: false },
  );
  process.exitCode = result.status ?? 1;
} else {
  console.log("Sem ficheiros alterados suportados pelo Prettier.");
}
