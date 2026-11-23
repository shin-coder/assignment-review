// PreToolUse（Edit|Write）: 編集禁止のファイルへの書き込みをブロックする
// 終了コード 2 でツール呼び出しをブロックし、stderr の内容が Claude に伝わる
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
// Windows ではバックスラッシュ区切りで届くため、スラッシュに揃えてから比較する
const filePath = (input.tool_input?.file_path ?? "").replaceAll("\\", "/");
const fileName = filePath.split("/").pop() ?? "";

const rules = [
  {
    // .env と .env.* を禁止（.env.example は除く）
    matches: () => /^\.env(\..+)?$/.test(fileName) && fileName !== ".env.example",
    reason: ".env ファイルは編集禁止です",
  },
  // TODO: テスト用サンプルサイトのディレクトリが決まったら追加する
  // {
  //   matches: () => filePath.includes("/<サンプルサイトのディレクトリ>/"),
  //   reason: "テスト用サンプルサイトは期待値の基準なので編集禁止です",
  // },
];

const hit = rules.find((rule) => rule.matches());
if (hit) {
  process.stderr.write(`${hit.reason}: ${filePath}\n`);
  process.exit(2);
}

process.exit(0);
