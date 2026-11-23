import type { ReactNode } from "react";
import type { Tool } from "../../app/reviewController";
import { CodeIcon, CommentIcon, CursorIcon } from "./icons";

export interface ToolbarProps {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
}

const TOOLS: { id: Tool; name: string; icon: ReactNode }[] = [
  { id: "browse", name: "操作", icon: <CursorIcon size={22} /> },
  { id: "comment", name: "コメント", icon: <CommentIcon size={22} /> },
  { id: "dev", name: "開発", icon: <CodeIcon size={22} /> },
];

/** 画面下の浮いたツールバー。アイコンだけを並べる（名前はホバーで出る） */
export function Toolbar({ tool, onToolChange }: ToolbarProps) {
  return (
    <div className="toolbar" role="radiogroup" aria-label="モード">
      {TOOLS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="radio"
          aria-checked={tool === item.id}
          aria-label={item.name}
          title={item.name}
          className="toolbar-tool"
          data-testid={`tool-${item.id}`}
          onClick={() => onToolChange(item.id)}
        >
          {item.icon}
        </button>
      ))}
    </div>
  );
}
