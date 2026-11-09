// PostToolUse（Edit|Write）: 編集されたファイルを Prettier で整形する
// 整形に失敗したときは終了コード 2 で、エラー内容を Claude に伝える（ツール自体は実行済み）
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
const filePath = input.tool_input?.file_path;
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

// プロジェクト外のファイルと、Prettier 未インストールの間は何もしない
const relative = filePath ? path.relative(projectDir, filePath) : "";
const isInsideProject = relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
if (!isInsideProject || !existsSync(path.join(projectDir, "node_modules", "prettier"))) {
  process.exit(0);
}

const result = spawnSync("pnpm", ["exec", "prettier", "--write", "--ignore-unknown", filePath], {
  cwd: projectDir,
  encoding: "utf8",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  process.stderr.write(`Prettier の整形に失敗しました: ${filePath}\n${result.stderr ?? ""}`);
  process.exit(2);
}

process.exit(0);
