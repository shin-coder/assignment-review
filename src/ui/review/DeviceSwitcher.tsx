import type { ReactNode } from "react";
import { DEVICES, type DeviceId } from "./devices";
import { DesktopIcon, PhoneIcon, TabletIcon } from "./icons";

const ICONS: Record<DeviceId, ReactNode> = {
  pc: <DesktopIcon size={18} />,
  tablet: <TabletIcon size={18} />,
  mobile: <PhoneIcon size={18} />,
};

export interface DeviceSwitcherProps {
  device: DeviceId;
  onChange: (device: DeviceId) => void;
  /** 縮小して表示しているときの倍率（%）。等倍なら null */
  zoomPercent: number | null;
}

/**
 * プレビューの上の中央に置く、幅（PC / タブレット / モバイル）の切り替え。
 * アイコンだけを並べ、幅と倍率はホバーで出す
 */
export function DeviceSwitcher({ device, onChange, zoomPercent }: DeviceSwitcherProps) {
  const index = Math.max(
    0,
    DEVICES.findIndex((item) => item.id === device),
  );
  return (
    <div className="device-switcher" role="radiogroup" aria-label="プレビューの幅">
      <span
        className="device-switcher-indicator"
        aria-hidden="true"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {DEVICES.map((item) => {
        const active = device === item.id;
        const zoom = active && zoomPercent !== null ? `・${zoomPercent}% で表示` : "";
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${item.label} ${item.width}px`}
            title={`${item.label}（${item.width}px）${zoom}`}
            className="device-switcher-option"
            data-testid={`device-${item.id}`}
            onClick={() => onChange(item.id)}
          >
            {ICONS[item.id]}
          </button>
        );
      })}
    </div>
  );
}
