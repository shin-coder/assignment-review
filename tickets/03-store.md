# 03: ソース管理層と IndexedDB 保存

- Wave: 1
- 依存: 00
- 担当ディレクトリ: `src/store/`
- 変更禁止の領域: `src/shared/`, `package.json`, ルートの設定ファイル, 他層のディレクトリ

## 目的

元のソース・編集後のソース・コメントを 1 つのプロジェクトとして保持し、IndexedDB に保存・復元する。ブラウザを再読み込みしても、フォルダを選び直さずに作業を再開できるようにする。

## 関連する設計ルール

- ソース管理層: 元のソース・編集後のソース・コメントを保持し、IndexedDB に保存する
- 編集やコメントは一時的に見せるためのもので、生徒に渡すファイルは作らない
- 中核ロジック（保存と復元）には必ず Vitest の単体テストを書く

## 実装チェックリスト

### ソース管理（メモリ上）

- [x] `SourceStore` クラス（または同等の関数群）を作る
  - [x] `getOriginal(path)` / `getEdited(path)`（未編集なら元のソースを返す）
  - [x] `setEdited(path, text)` / `resetFile(path)` / `resetAll()`
  - [x] `isEdited(path)` / `editedPaths()`
  - [x] 変更を購読できる `subscribe(listener)`（React 側で再描画に使う）
- [x] 元のソースは読み込み後に変更できないようにする（`setEdited` で元を書き換えない）
- [x] コメントの追加・更新・削除・一覧（紐付けの計算は 06 の担当。ここでは保持だけ）

### IndexedDB 保存

- [x] `src/shared` の `ProjectRepository` を `idb` で実装する（`IndexedDbProjectRepository`）
  - [x] DB 名・バージョン・オブジェクトストアを定数で定義し、`upgrade` でスキーマを作る
  - [x] `ArrayBuffer`（画像）も保存・復元できる
  - [x] `Map` は保存できる形（配列など）に変換し、復元時に戻す
- [x] 編集・コメントの変更時に自動保存する（短時間の連続変更はまとめる。デバウンス時間は定数）
- [x] 最後に開いていたプロジェクト ID を保存し、起動時に復元できる `loadLatest()`
- [x] 保存失敗（容量超過など）を呼び出し側に伝える

## テストチェックリスト

- [x] `fake-indexeddb` を使い、保存 → 新しいリポジトリインスタンスで読み込み → 内容が一致する（テキスト・バイナリ・編集後ソース・コメント）
- [x] 未編集ファイルは `getEdited` が元のソースを返す
- [x] `resetFile` / `resetAll` で元に戻る
- [x] 元のソースが編集で変わらない
- [x] 自動保存のデバウンス（偽タイマーで、連続変更が 1 回の保存になる）
- [x] `loadLatest()` が最後のプロジェクトを返す／何もなければ `null`
- [x] `remove()` 後は `load()` が `null`

## 完了条件

- [x] `pnpm exec tsc --noEmit` が通る
- [x] `pnpm exec vitest run` が通る
- [x] `pnpm exec eslint .` が通る

## メモ

### ファイル構成

- `src/store/sourceStore.ts`: メモリ上のソース管理（`SourceStore`）
- `src/store/indexedDbProjectRepository.ts`: `ProjectRepository` の IndexedDB 実装
- `src/store/autoSave.ts`: 変更を購読してデバウンスつきで保存する
- `src/store/errors.ts`: `StoreError`（保存・復元の失敗）
- `src/store/testData.ts`: テスト用のデータ作成（本体からは使わない）

### 公開 API（`src/store/index.ts`）— 12（統合）向け

```ts
// ---- SourceStore ----
type SourceStoreChange = { type: "edit"; paths: string[] } | { type: "comments" };
type SourceStoreListener = (change: SourceStoreChange) => void;
interface SourceStoreInit {
  projectId: string;
  name: string;
  originalFiles: VirtualFileSystem;
  editedTexts?: Record<string, string>;
  comments?: readonly ReviewComment[];
  updatedAt?: number;
  now?: () => number;
}
type ReviewCommentPatch = Partial<Omit<ReviewComment, "id">>;
class SourceStore {
  constructor(init: SourceStoreInit);
  static fromSnapshot(snapshot: ProjectSnapshot, options?: { now?: () => number }): SourceStore;
  readonly projectId: string;
  readonly name: string;
  readonly updatedAt: number; // getter
  paths(): string[];
  hasFile(path: string): boolean;
  getOriginal(path: string): string | ArrayBuffer | undefined;
  getEdited(path: string): string | ArrayBuffer | undefined; // 未編集なら元の内容
  currentFiles(): VirtualFile[]; // 編集を反映したファイル群（sw:put-files・解析に渡す）
  setEdited(path: string, text: string): void; // 存在しない・バイナリは例外。元と同じなら未編集に戻す
  resetFile(path: string): void;
  resetAll(): void; // コメントは残す
  isEdited(path: string): boolean;
  editedPaths(): string[];
  getComments(): readonly ReviewComment[];
  getComment(id: string): ReviewComment | undefined;
  addComment(comment: ReviewComment): void; // 同じ id は例外
  updateComment(id: string, patch: ReviewCommentPatch): void; // 存在しない id は例外
  removeComment(id: string): void; // 存在しない id は何もしない
  replaceComments(comments: readonly ReviewComment[]): void; // 06 で位置を追従し直した結果を入れる
  subscribe(listener: SourceStoreListener): () => void;
  toSnapshot(): ProjectSnapshot; // 次の変更まで同じ参照（useSyncExternalStore の getSnapshot に使える）
}

// ---- IndexedDB ----
const DB_NAME = "student-site-review";
const DB_VERSION = 1;
const STORE_NAMES = { projects: "projects", originalFiles: "originalFiles", meta: "meta" };
const META_KEYS = { latestProjectId: "latestProjectId" };
interface IndexedDbProjectRepositoryOptions {
  dbName?: string;
}
class IndexedDbProjectRepository implements ProjectRepository {
  constructor(options?: IndexedDbProjectRepositoryOptions);
  save(snapshot: ProjectSnapshot): Promise<void>; // 最後に開いたプロジェクトとしても記録する
  load(projectId: string): Promise<ProjectSnapshot | null>;
  list(): Promise<ProjectSummary[]>; // updatedAt の新しい順
  remove(projectId: string): Promise<void>; // 最後に開いたプロジェクトなら記録も消す
  setLatest(projectId: string): Promise<void>; // 一覧から開き直したときに呼ぶ
  loadLatest(): Promise<ProjectSnapshot | null>; // 起動時の復元。なければ null
  close(): Promise<void>;
}

// ---- 自動保存 ----
const AUTO_SAVE_DELAY_MS = 500;
type AutoSaveSource = Pick<SourceStore, "subscribe" | "toSnapshot">;
interface AutoSaveOptions {
  delayMs?: number;
  onError?: (error: StoreError) => void; // 省略時は console.error
  onSaved?: (snapshot: ProjectSnapshot) => void;
}
interface AutoSaver {
  flush(): Promise<void>;
  readonly dirty: boolean;
  dispose(): void;
}
function startAutoSave(
  source: AutoSaveSource,
  repository: ProjectRepository,
  options?: AutoSaveOptions,
): AutoSaver;

// ---- エラー ----
type StoreErrorCode = "quota-exceeded" | "save-failed" | "load-failed" | "remove-failed";
class StoreError extends Error {
  readonly code: StoreErrorCode;
} // message は画面にそのまま出せる文
function toStoreError(
  error: unknown,
  fallback: Exclude<StoreErrorCode, "quota-exceeded">,
): StoreError;
function isQuotaExceededError(error: unknown): boolean;
```

統合での使い方の想定:

1. 起動時: `repository.loadLatest()` → あれば `SourceStore.fromSnapshot()`、なければフォルダ選択を促す
2. フォルダを読み込んだら `new SourceStore({ projectId, name, originalFiles })` を作り、`repository.save(store.toSnapshot())` で一度保存する（自動保存は変更があったときだけ保存するため）
3. `startAutoSave(store, repository, { onError })` で自動保存を始める。`onError` で `error.message` を画面に出す
4. `store.subscribe()` の `change.paths` に JS が含まれていたら iframe を作り直す、などの判断に使う
5. プロジェクトを切り替えるときは `await saver.flush()` → `saver.dispose()`

### 設計上の判断

- **元のソースの不変性**: コンストラクタで渡された Map を写し取り、各 `VirtualFile` を `Object.freeze` する。`toSnapshot().originalFiles` は `set` / `delete` / `clear` で例外を投げる Map のサブクラスなので、外から差し替えられない。ただし `ArrayBuffer` の中身までは凍結できない（コピーするとメモリが倍になるため）
- **元と同じ内容の `setEdited`** は未編集に戻す（`isEdited` が false、`editedTexts` から消える）。同じ内容の再設定・変化のない `resetFile` / `resetAll` / `removeComment` は通知しない
- **コメント**は凍結したコピーを持ち、渡したオブジェクトを後で書き換えても影響しない
- **スキーマ**: `projects`（概要＋編集後ソース＋コメント）と `originalFiles`（元のファイル群）を分けた。一覧（`list()`）で画像などの大きいデータを読まないためと、自動保存のたびに元のファイル群を書き直さないため。`meta` には最後に開いたプロジェクト ID を入れる。`save()` / `remove()` は 3 つのストアを 1 トランザクションで書く
- **元のファイル群の書き込みの省略**: 同じリポジトリインスタンスが同じ `originalFiles` の Map（参照で比較、`WeakRef` で保持）を保存・読み込み済みで、かつ DB にレコードが残っていれば書き直さない。`SourceStore.toSnapshot()` は毎回同じ Map を返すので、自動保存では編集・コメントだけが書かれる。**同じ projectId で別の Map（フォルダを読み込み直したなど）を渡すと書き直す**
- **最後に開いたプロジェクト**: `save()` でも記録する（開いているプロジェクトだけが保存される前提）。保存済みのものを開き直しただけのときは `setLatest()` を呼ぶ
- **自動保存**: 最後の変更から `AUTO_SAVE_DELAY_MS`（500ms）変更がなければ保存する。保存は直列に行い、古いスナップショットが新しいものを上書きしない。失敗した変更は `dirty` のまま残し、次の変更か `flush()` で保存し直す。`flush()` は reject せず、失敗は `onError` に渡す
- **エラー**: `QuotaExceededError` は操作によらず `code: "quota-exceeded"`、それ以外は操作ごとの code にして `cause` に元のエラーを残す
- **DB の差し替え**: テストは DB 名（`dbName`）をテストごとに変えて分離した。`new IDBFactory()` の注入は、`idb` の `openDB` がグローバルの `indexedDB` しか使わないため採用しなかった
- **テスト環境の注意**: fake-indexeddb は Node の `structuredClone` で複製するため、読み込んだ `ArrayBuffer` は jsdom の `ArrayBuffer` と realm が違い `instanceof ArrayBuffer` が false になる（Chrome 本体では問題ない）。テストでは `Object.prototype.toString` の型タグで確かめている。他層のテストで復元結果を `instanceof` で判定しないこと（`isTextFile()` は `typeof` なので問題ない）

### 共有契約への提案（必須ではない）

- `ProjectRepository` に `loadLatest()` / `setLatest()` がないため、統合では `IndexedDbProjectRepository` を具体型のまま使う必要がある。他層のモックでも使いたい場合は `src/shared/project.ts` への追加を検討してほしい

## レビュー

- 判定: 承認
- 日付: 2026-11-10
- コマンド結果:
  - tsc: 成功
  - vitest: 成功（全体 136 件 / 12 ファイル。うち `src/store` は 44 件 / 4 ファイル）
  - eslint: 成功
  - prettier --check: 成功
  - playwright: 対象外
- チェックリストの根拠:
  - `SourceStore`（`getOriginal`/`getEdited`/`setEdited`/`resetFile`/`resetAll`/`isEdited`/`editedPaths`/`subscribe`）: `src/store/sourceStore.ts:118-175`, `:222`
  - 元のソースの不変性（Map の写し取り・`Object.freeze`・`ReadonlyFileMap`）: `src/store/sourceStore.ts:37-58`, `:85-87`
  - コメントの追加・更新・削除・一覧: `src/store/sourceStore.ts:179-217`
  - DB 名・バージョン・ストアの定数と `upgrade`: `src/store/indexedDbProjectRepository.ts:11-26`, `:197-203`
  - Map → 配列への変換と復元: `src/store/indexedDbProjectRepository.ts:92`, `:112`
  - 自動保存（デバウンス定数 `AUTO_SAVE_DELAY_MS`、直列化、失敗時は dirty を残す）: `src/store/autoSave.ts:6`, `:53-80`
  - `loadLatest()`: `src/store/indexedDbProjectRepository.ts:173-182`
  - 保存失敗の伝達（`StoreError`、容量超過は `quota-exceeded`）: `src/store/errors.ts:23-43`, `src/store/autoSave.ts:60-64`
  - テスト: 新しいインスタンスでの往復（テキスト・ArrayBuffer・編集・コメント）`indexedDbProjectRepository.test.ts:44`、getEdited の既定値 `sourceStore.test.ts:15`、resetFile/resetAll `sourceStore.test.ts:88,100`、元のソースの不変 `sourceStore.test.ts:33,47,58`、偽タイマーでのデバウンス `autoSave.test.ts:32`、loadLatest `indexedDbProjectRepository.test.ts:194,198`、remove 後の load `indexedDbProjectRepository.test.ts:152`
  - `skip` / `only` の残り、期待値のない `expect`、モックだけを検証するテストはない
- 未達の項目: なし
- ルール違反: なし（変更は `src/store/` と本チケットだけ。`src/shared/`・`package.json`・設定ファイル・`tests/fixtures/` は未変更。`package-lock.json` / `yarn.lock` なし。依存の追加なし）
- その他の指摘（任意・判定には影響しない改善案）:
  - 元のファイル群の書き込み省略で、メモに書かれている「同じ projectId で別の Map を渡すと書き直す」動作にテストがない。ここが壊れると古い元のファイル群が黙って残るので、`new SourceStore` を同じ projectId・中身の違う Map で作って保存 → 新しいインスタンスで読み込むと新しい内容になる、というテストを足すとよい（`src/store/indexedDbProjectRepository.ts:77-79`）
  - `load()` は普通の（書き換えられる）Map を返しつつ `#knownOriginals` に登録している（`src/store/indexedDbProjectRepository.ts:112-113`）。呼び出し側がこの Map を書き換えてからそのまま `save()` すると、書き込みが省略されて変更が保存されない。共有契約では「読み込み後は変更しない」なので現状は問題ないが、`ReadonlyFileMap` で返すか、`load()` では登録しないほうが安全。なお想定どおり `SourceStore.fromSnapshot()` を通すと別の Map になるため、この登録は省略に効かず、セッションの最初の自動保存で元のファイル群を 1 回書き直している
  - 複数タブで同じ projectId を開き、片方がフォルダを読み込み直した場合、もう片方は自分の Map を覚えているので書き込みを省略し、DB 上で「他のタブの元のファイル群 + このタブの編集」が混ざりうる。projectId を読み込みごとに新しく作るなら起きないので、12 での projectId の作り方とあわせて確認してほしい
  - リポジトリ経由の `load-failed` / `remove-failed` と、`save()` 自体が容量超過を `quota-exceeded` で reject する経路は、`toStoreError` の単体テストと自動保存のモックでしか確かめていない（fake-indexeddb では容量超過を起こしにくいので、許容範囲）
