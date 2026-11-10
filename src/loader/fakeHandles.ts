// テスト用の偽のフォルダハンドル。showDirectoryPicker を使わずに loadDirectory を試すために使う。
// 書き込み系のメソッドも持たせ、呼ばれたら writeCalls に記録する（読み込み層が呼ばないことの確認用）
import type { DirectoryHandleLike, FileHandleLike, FileLike } from "./loadDirectory";

/** 名前 → 中身。文字列はテキスト、Uint8Array はバイナリ、オブジェクトはフォルダ */
export interface FakeTree {
  [name: string]: string | Uint8Array | FakeTree;
}

export interface WriteCall {
  method: string;
  path: string;
}

export interface FakeDirectoryOptions {
  /** 書き込み系メソッドの呼び出しを記録する配列 */
  writeCalls?: WriteCall[];
  /** values() が名前の逆順で返すようにする（読み込み順が返り順に左右されないことの確認用） */
  reverseOrder?: boolean;
}

export function createFakeDirectory(
  name: string,
  tree: FakeTree,
  options: FakeDirectoryOptions = {},
): DirectoryHandleLike {
  return createDirectory(name, tree, name, options);
}

function createDirectory(
  name: string,
  tree: FakeTree,
  path: string,
  options: FakeDirectoryOptions,
): DirectoryHandleLike {
  const record = (method: string) => options.writeCalls?.push({ method, path });
  const names = Object.keys(tree);
  if (options.reverseOrder) names.reverse();

  return {
    kind: "directory",
    name,
    async *values() {
      for (const childName of names) {
        const child = tree[childName]!;
        const childPath = `${path}/${childName}`;
        yield typeof child === "string" || child instanceof Uint8Array
          ? createFile(childName, child, childPath, options)
          : createDirectory(childName, child, childPath, options);
      }
    },
    // 以下は書き込み系（読み込み層からは呼ばれないはず）
    ...({
      getFileHandle: async () => record("getFileHandle"),
      getDirectoryHandle: async () => record("getDirectoryHandle"),
      removeEntry: async () => record("removeEntry"),
    } as object),
  };
}

function createFile(
  name: string,
  content: string | Uint8Array,
  path: string,
  options: FakeDirectoryOptions,
): FileHandleLike {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const file: FileLike = {
    size: bytes.byteLength,
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.slice().buffer,
  };
  return {
    kind: "file",
    name,
    getFile: async () => file,
    ...({
      createWritable: async () => options.writeCalls?.push({ method: "createWritable", path }),
    } as object),
  };
}
