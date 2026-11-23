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

/** プレビューの上の中央に置く、幅（PC / タブレット / モバイル）の切り替え */
export function DeviceSwitcher({ device, onChange, zoomPercent }: DeviceSwitcherProps) {
  return (
    <div className="device-switcher">
      <div className="device-switcher-group" role="radiogroup" aria-label="プレビューの幅">
        {DEVICES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={device === item.id}
            aria-label={`${item.label} ${item.width}px`}
            title={`${item.label}（${item.width}px）`}
            className="device-switcher-option"
            data-testid={`device-${item.id}`}
            onClick={() => onChange(item.id)}
          >
            {ICONS[item.id]}
            <span className="device-switcher-width">{item.width}</span>
          </button>
        ))}
      </div>
      {zoomPercent !== null && (
        <span className="device-switcher-zoom" title="画面に収まるよう縮小して表示しています">
          {zoomPercent}%
        </span>
      )}
    </div>
  );
}
