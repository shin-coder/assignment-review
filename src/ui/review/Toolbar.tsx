import type { Tool } from "../../app/reviewController";

export interface ToolbarProps {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
}

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "browse", label: "View mode", hint: "サイトをそのまま操作して確認する（V）" },
  { id: "dev", label: "Dev mode", hint: "要素をクリックして HTML と CSS を見る・編集する（D）" },
];

/** 画面下の浮いたツールバー。View mode / Dev mode を文字だけで切り替える */
export function Toolbar({ tool, onToolChange }: ToolbarProps) {
  return (
    <div className="toolbar" role="radiogroup" aria-label="モード">
      {TOOLS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="radio"
          aria-checked={tool === item.id}
          title={item.hint}
          className="toolbar-tool"
          data-testid={`tool-${item.id}`}
          onClick={() => onToolChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
