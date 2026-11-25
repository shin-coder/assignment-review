import { LayersIcon } from "./icons";

/** ロゴ（重なった層のマーク ＋ 「review.」） */
export function Brand({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span className="brand" data-size={size}>
      <LayersIcon size={size === "lg" ? 28 : 26} strokeWidth={1.6} />
      <span className="brand-name">review.</span>
    </span>
  );
}
