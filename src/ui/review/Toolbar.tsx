import type { ReactNode } from "react";
import type { Tool } from "../../app/reviewController";
import { DEVICES, type DeviceId } from "./devices";
import { CodeIcon, CommentIcon, CursorIcon, DesktopIcon, PhoneIcon, TabletIcon } from "./icons";

export interface ToolbarProps {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  device: DeviceId;
  onDeviceChange: (device: DeviceId) => void;
}

const TOOLS: { id: Tool; label: string; hint: string; key: string; icon: ReactNode }[] = [
  {
    id: "browse",
    label: "操作",
    hint: "サイトをそのまま操作する（リンク・JS も動く）",
    key: "V",
    icon: <CursorIcon />,
  },
  {
    id: "comment",
    label: "コメント",
    hint: "要素をクリックしてコメントを付ける",
    key: "C",
    icon: <CommentIcon />,
  },
  {
    id: "dev",
    label: "開発",
    hint: "要素をクリックしてそのコードを見る・編集する",
    key: "D",
    icon: <CodeIcon />,
  },
];

const DEVICE_ICONS: Record<DeviceId, ReactNode> = {
  pc: <DesktopIcon />,
  tablet: <TabletIcon />,
  mobile: <PhoneIcon />,
};

/** 画面下の浮いたツールバー。左: ツール / 右: プレビューの幅 */
export function Toolbar({ tool, onToolChange, device, onDeviceChange }: ToolbarProps) {
  return (
    <div className="toolbar" role="toolbar" aria-label="ツール">
      <div className="toolbar-group" role="radiogroup" aria-label="モード">
        {TOOLS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={tool === item.id}
            className="toolbar-tool"
            data-testid={`tool-${item.id}`}
            title={`${item.hint}（${item.key}）`}
            onClick={() => onToolChange(item.id)}
          >
            {item.icon}
            <span className="toolbar-tool-label">{item.label}</span>
            <kbd className="toolbar-kbd">{item.key}</kbd>
          </button>
        ))}
      </div>
      <span className="toolbar-divider" aria-hidden="true" />
      <div className="toolbar-group toolbar-devices" role="radiogroup" aria-label="プレビューの幅">
        {DEVICES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={device === item.id}
            aria-label={`${item.label} ${item.width}px`}
            className="toolbar-device"
            data-testid={`device-${item.id}`}
            title={`${item.label}（${item.width}px）`}
            onClick={() => onDeviceChange(item.id)}
          >
            {DEVICE_ICONS[item.id]}
            <span className="toolbar-device-width">{item.width}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
