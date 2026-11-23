import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { DeviceSwitcher } from "./DeviceSwitcher";
import { deviceOf, type DeviceId } from "./devices";
import { computeGeometry, FALLBACK, PAD_TOP, type FrameGeometry } from "./geometry";

export type { FrameGeometry };

export interface DeviceCanvasProps {
  device: DeviceId;
  onDeviceChange: (device: DeviceId) => void;
  /** iframe（プレビュー）。デバイスの幅で描き、縮小は親がまとめて行う */
  children: ReactNode;
  /** 枠の上に重ねる層（コメントのピンなど）。画面上の座標で描く */
  overlay?: (geometry: FrameGeometry) => ReactNode;
}

/**
 * 灰色のキャンバスの中央に、選んだデバイスの幅でプレビューを置く。
 * 入りきらない幅（PC の 1440px など）は、iframe のビューポートの幅を変えずに縮小して見せる
 */
export function DeviceCanvas({ device, onDeviceChange, children, overlay }: DeviceCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(FALLBACK);

  useLayoutEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width > 0 && height > 0) setSize({ width, height });
    };
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const info = deviceOf(device);
  const geometry = computeGeometry(size, info.width);
  const percent = Math.round(geometry.scale * 100);

  return (
    <div className="canvas" ref={canvasRef} data-testid="canvas">
      <DeviceSwitcher
        device={device}
        onChange={onDeviceChange}
        zoomPercent={percent < 100 ? percent : null}
      />
      <div
        className="device"
        data-device={device}
        // transform で中央に寄せると、iframe 内の要素の位置の計算（自動テストなど）がずれるため、left を px で決める
        style={{
          width: geometry.width,
          height: geometry.height,
          top: PAD_TOP,
          left: geometry.roomLeft,
        }}
      >
        <div
          className="device-viewport"
          style={{
            width: geometry.frameWidth,
            height: geometry.frameHeight,
            transform: geometry.scale < 1 ? `scale(${geometry.scale})` : undefined,
          }}
        >
          {children}
        </div>
        {overlay && <div className="device-overlay">{overlay(geometry)}</div>}
      </div>
    </div>
  );
}
