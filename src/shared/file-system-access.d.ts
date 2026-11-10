// Chrome の File System Access API のうち、TypeScript 標準の DOM 型にないものを補う。
// Chrome 以外には存在しないため省略可能（?）として宣言し、呼び出し側で有無を確かめさせる。

interface DirectoryPickerOptions {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?:
    FileSystemHandle | "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
}

interface Window {
  showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
}
