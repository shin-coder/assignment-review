import { describe, expect, it } from "vitest";
import { relativeTime } from "./relativeTime";

describe("relativeTime", () => {
  const now = new Date(2026, 10, 17, 12, 0, 0).getTime();
  it.each([
    [now, "たった今"],
    [now - 59_000, "たった今"],
    [now - 5 * 60_000, "5分前"],
    [now - 3 * 3_600_000, "3時間前"],
    [now - 2 * 86_400_000, "2日前"],
    [new Date(2026, 0, 5).getTime(), "2026/1/5"],
    [now + 10_000, "たった今"],
  ])("%d → %s", (time, expected) => {
    expect(relativeTime(time, now)).toBe(expected);
  });
});
