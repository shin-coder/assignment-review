/** 枠の上（ラベルとプロジェクト名の分）と下（ツールバーの分）の余白 */
export const PAD_TOP = 72;
const PAD_BOTTOM = 96;
const PAD_X = 32;
/** 測れないとき（jsdom など）の大きさ */
export const FALLBACK = { width: 1280, height: 800 };

/** キャンバス上での、プレビュー枠の位置と倍率 */
export interface FrameGeometry {
  /** 1 未満なら縮小して表示している */
  scale: number;
  /** iframe の CSS 上の幅（デバイスの幅）と高さ */
  frameWidth: number;
  frameHeight: number;
  /** 画面上の枠の幅・高さ（frameWidth × scale など） */
  width: number;
  height: number;
  /** 枠の左端からキャンバスの左右の端までの余白（ポップオーバーをはみ出させてよい範囲） */
  roomLeft: number;
  roomRight: number;
}

export function computeGeometry(
  canvas: { width: number; height: number },
  deviceWidth: number,
): FrameGeometry {
  const availableWidth = Math.max(160, canvas.width - PAD_X * 2);
  const availableHeight = Math.max(200, canvas.height - PAD_TOP - PAD_BOTTOM);
  const scale = Math.min(1, availableWidth / deviceWidth);
  const width = deviceWidth * scale;
  const room = (canvas.width - width) / 2;
  return {
    scale,
    frameWidth: deviceWidth,
    frameHeight: Math.round(availableHeight / scale),
    width,
    height: availableHeight,
    roomLeft: room,
    roomRight: room,
  };
}
