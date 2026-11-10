import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommentComposer, NO_TARGET_REASON } from "./CommentComposer";

// Vitest の globals を有効にしていないため、Testing Library の自動後片付けが働かない。テストごとに明示的に片付ける
afterEach(cleanup);

function setup(props: Partial<Parameters<typeof CommentComposer>[0]> = {}) {
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  render(
    <CommentComposer
      targetLabel="div#main.card"
      disabledReason={null}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  const textarea = screen.getByRole("textbox", { name: "コメント" });
  const submitButton = screen.getByRole("button", { name: "コメントを追加" });
  return { onSubmit, user, textarea, submitButton };
}

describe("CommentComposer", () => {
  it("対象の要素の表示名を表示する", () => {
    setup();
    expect(screen.getByText("div#main.card")).toBeInTheDocument();
  });

  it("入力してボタンで送信すると、本文付きで onSubmit が呼ばれ、入力欄が空になる", async () => {
    const { onSubmit, user, textarea, submitButton } = setup();
    await user.type(textarea, "余白が狭いです");
    await user.click(submitButton);
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("余白が狭いです");
    expect(textarea).toHaveValue("");
  });

  it("前後の空白を取り除いて送信する", async () => {
    const { onSubmit, user, textarea, submitButton } = setup();
    await user.type(textarea, "  色を変える  ");
    await user.click(submitButton);
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("色を変える");
  });

  it.each(["{Control>}{Enter}{/Control}", "{Meta>}{Enter}{/Meta}"])(
    "%s で送信できる",
    async (shortcut) => {
      const { onSubmit, user, textarea } = setup();
      await user.type(textarea, "見出しを大きく");
      await user.keyboard(shortcut);
      expect(onSubmit).toHaveBeenCalledExactlyOnceWith("見出しを大きく");
      expect(textarea).toHaveValue("");
    },
  );

  it("Enter だけでは送信せず改行になる", async () => {
    const { onSubmit, user, textarea } = setup();
    await user.type(textarea, "1行目{Enter}2行目");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("1行目\n2行目");
  });

  it.each(["", "   ", "{Enter}{Enter}"])("空・空白だけの本文 %j は送信できない", async (input) => {
    const { onSubmit, user, textarea, submitButton } = setup();
    await user.click(textarea);
    if (input !== "") await user.keyboard(input.replaceAll(" ", "[Space]"));
    expect(submitButton).toBeDisabled();
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disabledReason があると入力できず、理由が表示される", async () => {
    const reason = "JS が生成した要素にはコメントできません";
    const { onSubmit, user, textarea, submitButton } = setup({ disabledReason: reason });
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(textarea).toBeDisabled();
    expect(textarea).toHaveAccessibleDescription(reason);
    expect(submitButton).toBeDisabled();
    await user.type(textarea, "入力できない");
    expect(textarea).toHaveValue("");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("対象の要素がないと入力できず、要素の選択を促す", () => {
    const { textarea, submitButton } = setup({ targetLabel: null });
    expect(screen.getByText(NO_TARGET_REASON)).toBeInTheDocument();
    expect(textarea).toBeDisabled();
    expect(submitButton).toBeDisabled();
  });

  it("入力中に無効になったら送信できない", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <CommentComposer targetLabel="p" disabledReason={null} onSubmit={onSubmit} />,
    );
    await user.type(screen.getByRole("textbox"), "途中まで");
    rerender(<CommentComposer targetLabel={null} disabledReason={null} onSubmit={onSubmit} />);
    expect(screen.getByRole("button", { name: "コメントを追加" })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
