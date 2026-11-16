import type { ElementInfo, ReviewComment } from "../shared";

/** コメントを作れなかった理由 */
export type CreateCommentFailureReason =
  /** JS が後から生成した要素（対応表にない要素） */
  | "generated-element"
  /** parse5 が補正で暗黙に作った要素（ソースに開始タグがない要素） */
  | "implicit-element"
  /** 本文が空（空白だけを含む） */
  | "empty-body";

export type CreateCommentResult =
  | { ok: true; comment: ReviewComment }
  | {
      ok: false;
      reason: CreateCommentFailureReason;
      /** そのまま画面に出せる文 */
      message: string;
    };

export interface CreateCommentOptions {
  /** コメント ID の作り方。省略時は crypto.randomUUID() */
  idFactory?: () => string;
  /** 作成時刻の取り方。省略時は Date.now() */
  now?: () => number;
}

const FAILURE_MESSAGES: Record<CreateCommentFailureReason, string> = {
  "generated-element":
    "JS が生成した要素はソース上に対応する位置がないため、コメントを付けられません",
  "implicit-element":
    "ソースに開始タグがない要素（ブラウザが補った要素）には、コメントを付けられません",
  "empty-body": "コメントの本文を入力してください",
};

function failure(reason: CreateCommentFailureReason): CreateCommentResult {
  return { ok: false, reason, message: FAILURE_MESSAGES[reason] };
}

/**
 * 要素の位置（要素全体の範囲）に紐付けたコメントを作る。
 * info が null（JS 生成要素）または info.location が null（暗黙に作られた要素）の場合は作らず、理由を返す。
 * 本文は受け取ったまま保存する（空白だけの本文は拒否する）。
 */
export function createComment(
  info: ElementInfo | null,
  body: string,
  options: CreateCommentOptions = {},
): CreateCommentResult {
  if (info === null) return failure("generated-element");
  if (info.location === null) return failure("implicit-element");
  if (body.trim() === "") return failure("empty-body");

  const { idFactory = () => crypto.randomUUID(), now = () => Date.now() } = options;
  const { filePath, start, end } = info.location;
  return {
    ok: true,
    comment: {
      id: idFactory(),
      location: { filePath, start, end },
      body,
      createdAt: now(),
      status: "active",
    },
  };
}
