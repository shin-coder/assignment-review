import { describe, expect, it } from "vitest";
import { computeGeometry } from "./geometry";

describe("computeGeometry", () => {
  it("入りきらない幅は縮小し、iframe の高さは縮小前の値にする", () => {
    const g = computeGeometry({ width: 1064, height: 868 }, 1440);
    expect(g.scale).toBeCloseTo(1000 / 1440);
    expect(g.width).toBeCloseTo(1000);
    expect(g.height).toBe(700);
    expect(g.frameWidth).toBe(1440);
    expect(g.frameHeight).toBe(Math.round(700 / (1000 / 1440)));
  });

  it("入る幅は等倍で、中央に置いた残りを左右の余白にする", () => {
    const g = computeGeometry({ width: 1200, height: 868 }, 390);
    expect(g.scale).toBe(1);
    expect(g.frameHeight).toBe(700);
    expect(g.roomLeft).toBe((1200 - 390) / 2);
  });
});
