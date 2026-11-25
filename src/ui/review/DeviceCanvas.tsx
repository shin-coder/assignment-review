import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { deviceOf, type DeviceId } from "./devices";
import { computeGeometry, FALLBACK, PAD_TOP, type FrameGeometry } from "./geometry";

export type { FrameGeometry };

/** 幅を切り替えたときの枠のアニメーションの長さ（app.css の .device[data-switching] と揃える） */
const DEVICE_TRANSITION_MS = 320;

export interface DeviceCanvasProps {
  device: DeviceId;
  /** 縮小して表示しているときの倍率（%）を知らせる。等倍なら null */
  onZoomChange?: (percent: number | null) => void;
  /** iframe（プレビュー）。デバイスの幅で描き、縮小は親がまとめて行う */
  children: ReactNode;
}

/**
 * 灰色のキャンバスの中央に、選んだデバイスの幅でプレビューを置く。
 * 入りきらない幅（PC の 1440px など）は、iframe のビューポートの幅を変えずに縮小して見せる
 */
export function DeviceCanvas({ device, onZoomChange, children }: DeviceCanvasProps) {
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
  const zoom = percent < 100 ? percent : null;
  useEffect(() => onZoomChange?.(zoom), [zoom, onZoomChange]);

  // 幅を切り替えた直後だけ枠の大きさを動かし、中のサイトは一瞬隠す
  // （中のレイアウトが組み変わる途中を見せない）。
  // パネルの開閉などでキャンバスの大きさが変わるときは、毎フレームそのまま追従させる
  // 新しい幅と「切り替え中」の目印は同じ描画で反映する（目印が後になると動かずに切り替わる）
  const [shownDevice, setShownDevice] = useState(device);
  const [switching, setSwitching] = useState(false);
  if (shownDevice !== device) {
    setShownDevice(device);
    setSwitching(true);
  }
  useEffect(() => {
    if (!switching) return;
    const handle = setTimeout(() => setSwitching(false), DEVICE_TRANSITION_MS);
    return () => clearTimeout(handle);
  }, [switching, device]);

  return (
    <div className="canvas" ref={canvasRef} data-testid="canvas">
      <div
        className="device"
        data-device={device}
        data-switching={switching ? "true" : undefined}
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
      </div>
    </div>
  );
}
