// iframe 内に注入する操作スクリプトの入口（<script type="module" src={injectScriptUrl(isDev)}>）。
// React や他の層を import しない（src/shared の型・定数だけ使ってよい）。
// モジュールとして読み込まれるため、ここでの変数はグローバルにならない。
// 即時実行の関数で包み、名前も外へ出さない
import { installReviewScript } from "./reviewScript";

(() => {
  installReviewScript(window);
})();
