// Stop: 応答を終える前に型チェックと単体テストを実行する
// 失敗したら終了コード 2 で Claude を止めずに作業を続けさせ、エラー内容を伝える
// すでにこのフックで作業を続けた後（stop_hook_active が true）にまだ失敗する場合は、
// ループを避けるために終了を許可し、ユーザーに警告だけを表示する
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const has = (...segments) => existsSync(path.join(projectDir, ...segments));

const checks = [
  {
    name: "型チェック",
    args: ["exec", "tsc", "--noEmit"],
    ready: has("node_modules", "typescript") && has("tsconfig.json"),
  },
  {
    name: "単体テスト",
    args: ["exec", "vitest", "run", "--passWithNoTests"],
    ready: has("node_modules", "vitest"),
  },
];

const failures = [];
for (const check of checks) {
  // セットアップ前（依存パッケージや設定ファイルがない間）は実行しない
  if (!check.ready) continue;

  const result = spawnSync("pnpm", check.args, {
    cwd: projectDir,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    // 出力が長い場合は末尾だけを渡す
    failures.push(`## ${check.name}が失敗しました\n${output.slice(-3000)}`);
  }
}

if (failures.length === 0) {
  process.exit(0);
}

if (input.stop_hook_active) {
  process.stdout.write(
    JSON.stringify({
      systemMessage: `型チェックまたは単体テストがまだ失敗しています。内容を確認してください。`,
    }),
  );
  process.exit(0);
}

process.stderr.write(`${failures.join("\n\n")}\n\n上記を修正してから作業を終えてください。`);
process.exit(2);
