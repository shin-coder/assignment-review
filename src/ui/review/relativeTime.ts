const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** コメントの時刻を「たった今」「5分前」「3時間前」「2日前」「2026/1/5」の形で返す */
export function relativeTime(time: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - time);
  if (diff < MINUTE) return "たった今";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}分前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}時間前`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}日前`;
  const date = new Date(time);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}
