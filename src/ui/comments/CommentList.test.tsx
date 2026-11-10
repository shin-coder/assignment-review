import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewComment } from "../../shared";
import { CommentList, ORPHANED_MESSAGE } from "./CommentList";

// Vitest の globals を有効にしていないため、Testing Library の自動後片付けが働かない。テストごとに明示的に片付ける
afterEach(cleanup);

function comment(
  id: string,
  filePath: string,
  start: number,
  overrides: Partial<ReviewComment> = {},
): ReviewComment {
  return {
    id,
    location: { filePath, start, end: start + 10 },
    body: `本文${id}`,
    createdAt: 0,
    status: "active",
    ...overrides,
  };
}

function setup(
  comments: ReviewComment[],
  options: { labels?: Record<string, string>; activeId?: string | null } = {},
) {
  const handlers = { onSelect: vi.fn(), onDelete: vi.fn(), onUpdate: vi.fn() };
  const user = userEvent.setup();
  render(
    <CommentList
      comments={comments}
      labels={options.labels ?? {}}
      activeId={options.activeId ?? null}
      {...handlers}
    />,
  );
  return { ...handlers, user };
}

function item(id: string) {
  return screen.getByTestId(`comment-${id}`);
}

describe("CommentList", () => {
  it("コメントがなければその旨を表示する", () => {
    setup([]);
    expect(screen.getByText("コメントはまだありません")).toBeInTheDocument();
  });

  it("ファイル・ソース位置の順に並べる", () => {
    setup([
      comment("c", "index.html", 300),
      comment("a", "about.html", 50),
      comment("b", "index.html", 20),
    ]);
    const ids = screen.getAllByRole("listitem").map((li) => li.dataset.testid);
    expect(ids).toEqual(["comment-a", "comment-b", "comment-c"]);
  });

  it("要素の表示名と本文を表示し、表示名がなければファイルパスを表示する", () => {
    setup([comment("a", "index.html", 0), comment("b", "about.html", 0)], {
      labels: { a: "h1.title" },
    });
    expect(within(item("a")).getByText("h1.title")).toBeInTheDocument();
    expect(within(item("a")).getByText("本文a")).toBeInTheDocument();
    expect(within(item("b")).getByText("about.html")).toBeInTheDocument();
  });

  it("orphaned のコメントは区別して表示する", () => {
    setup([comment("a", "index.html", 0), comment("b", "index.html", 5, { status: "orphaned" })]);
    expect(within(item("b")).getByText(ORPHANED_MESSAGE)).toBeInTheDocument();
    expect(item("b")).toHaveAttribute("data-status", "orphaned");
    expect(within(item("a")).queryByText(ORPHANED_MESSAGE)).not.toBeInTheDocument();
    expect(item("a")).toHaveAttribute("data-status", "active");
  });

  it("activeId のコメントを選択中として示す", () => {
    setup([comment("a", "index.html", 0), comment("b", "index.html", 5)], { activeId: "b" });
    expect(item("b")).toHaveAttribute("aria-current", "true");
    expect(item("a")).not.toHaveAttribute("aria-current");
  });

  it("クリックすると onSelect が ID 付きで呼ばれる", async () => {
    const { user, onSelect, onDelete, onUpdate } = setup([comment("a", "index.html", 0)]);
    await user.click(within(item("a")).getByText("本文a"));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("a");
    expect(onDelete).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  describe("編集", () => {
    it("本文を書き換えて保存すると onUpdate が呼ばれる", async () => {
      const { user, onUpdate, onSelect } = setup([comment("a", "index.html", 0)]);
      await user.click(within(item("a")).getByRole("button", { name: "編集" }));
      const textarea = within(item("a")).getByRole("textbox", { name: "コメントの編集" });
      expect(textarea).toHaveValue("本文a");
      expect(textarea).toHaveFocus();
      await user.clear(textarea);
      await user.type(textarea, " 新しい本文 ");
      await user.click(within(item("a")).getByRole("button", { name: "保存" }));
      expect(onUpdate).toHaveBeenCalledExactlyOnceWith("a", "新しい本文");
      expect(onSelect).not.toHaveBeenCalled();
      expect(within(item("a")).queryByRole("textbox")).not.toBeInTheDocument();
    });

    it("Ctrl + Enter で保存できる", async () => {
      const { user, onUpdate } = setup([comment("a", "index.html", 0)]);
      await user.click(within(item("a")).getByRole("button", { name: "編集" }));
      await user.keyboard("追記{Control>}{Enter}{/Control}");
      expect(onUpdate).toHaveBeenCalledExactlyOnceWith("a", "本文a追記");
    });

    it("空にすると保存できない", async () => {
      const { user, onUpdate } = setup([comment("a", "index.html", 0)]);
      await user.click(within(item("a")).getByRole("button", { name: "編集" }));
      await user.clear(within(item("a")).getByRole("textbox"));
      expect(within(item("a")).getByRole("button", { name: "保存" })).toBeDisabled();
      await user.keyboard("{Control>}{Enter}{/Control}");
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it("変更せずに保存しても onUpdate は呼ばれない", async () => {
      const { user, onUpdate } = setup([comment("a", "index.html", 0)]);
      await user.click(within(item("a")).getByRole("button", { name: "編集" }));
      await user.click(within(item("a")).getByRole("button", { name: "保存" }));
      expect(onUpdate).not.toHaveBeenCalled();
      expect(within(item("a")).getByText("本文a")).toBeInTheDocument();
    });

    it.each([
      ["キャンセルボタン", "button"],
      ["Escape", "escape"],
    ] as const)("%s で編集をやめると onUpdate は呼ばれない", async (_, how) => {
      const { user, onUpdate } = setup([comment("a", "index.html", 0)]);
      await user.click(within(item("a")).getByRole("button", { name: "編集" }));
      await user.type(within(item("a")).getByRole("textbox"), "やめる");
      if (how === "button") {
        await user.click(within(item("a")).getByRole("button", { name: "キャンセル" }));
      } else {
        await user.keyboard("{Escape}");
      }
      expect(onUpdate).not.toHaveBeenCalled();
      expect(within(item("a")).getByText("本文a")).toBeInTheDocument();
    });
  });

  describe("削除", () => {
    it("確認を経て onDelete が呼ばれる", async () => {
      const confirmSpy = vi.spyOn(window, "confirm");
      const { user, onDelete, onSelect } = setup([comment("a", "index.html", 0)]);
      await user.click(within(item("a")).getByRole("button", { name: "削除" }));
      expect(onDelete).not.toHaveBeenCalled();
      const dialog = within(item("a")).getByRole("alertdialog", { name: "削除の確認" });
      expect(within(dialog).getByText("このコメントを削除しますか？")).toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: "削除する" }));
      expect(onDelete).toHaveBeenCalledExactlyOnceWith("a");
      expect(onSelect).not.toHaveBeenCalled();
      expect(confirmSpy).not.toHaveBeenCalled();
    });

    it("確認でキャンセルすると onDelete は呼ばれない", async () => {
      const { user, onDelete } = setup([comment("a", "index.html", 0)]);
      await user.click(within(item("a")).getByRole("button", { name: "削除" }));
      const dialog = within(item("a")).getByRole("alertdialog");
      expect(within(dialog).getByRole("button", { name: "キャンセル" })).toHaveFocus();
      await user.click(within(dialog).getByRole("button", { name: "キャンセル" }));
      expect(onDelete).not.toHaveBeenCalled();
      expect(within(item("a")).queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("確認は押したコメントにだけ表示される", async () => {
      const { user } = setup([comment("a", "index.html", 0), comment("b", "index.html", 5)]);
      await user.click(within(item("b")).getByRole("button", { name: "削除" }));
      expect(within(item("b")).getByRole("alertdialog")).toBeInTheDocument();
      expect(within(item("a")).queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });
});
