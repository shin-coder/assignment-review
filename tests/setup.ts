// Vitest の共通セットアップ
// - toBeInTheDocument() などの DOM 用マッチャー
// - jsdom にない IndexedDB を fake-indexeddb で用意する（テストごとに新しい DB が必要なら new IDBFactory() を使う）
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
