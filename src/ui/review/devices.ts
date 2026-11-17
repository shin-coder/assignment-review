/** プレビューの幅の切り替え */
export interface Device {
  id: "pc" | "tablet" | "mobile";
  label: string;
  width: number;
  shortcut: string;
}

export const DEVICES: readonly Device[] = [
  { id: "pc", label: "PC", width: 1440, shortcut: "1" },
  { id: "tablet", label: "タブレット", width: 768, shortcut: "2" },
  { id: "mobile", label: "モバイル", width: 390, shortcut: "3" },
];

export type DeviceId = Device["id"];

export function deviceOf(id: DeviceId): Device {
  return DEVICES.find((device) => device.id === id) ?? DEVICES[0]!;
}
