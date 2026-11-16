import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileTabs } from "./FileTabs";

const files = [
  { path: "index.html", modified: true },
  { path: "css/style.css" },
  { path: "js/main.js", modified: false },
];

describe("FileTabs", () => {
  afterEach(cleanup);

  it("ファイル名のタブを並べ、選択中のタブを示す", () => {
    render(<FileTabs files={files} activePath="css/style.css" onSelect={vi.fn()} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.title)).toEqual(["index.html", "css/style.css", "js/main.js"]);
    expect(screen.getByRole("tab", { name: "style.css" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "main.js" })).toHaveAttribute("aria-selected", "false");
  });

  it("編集済みのファイルにだけ目印を付ける", () => {
    render(<FileTabs files={files} activePath={null} onSelect={vi.fn()} />);

    const [html, css, js] = screen.getAllByRole("tab");
    expect(within(html!).getByLabelText("編集済み")).toBeInTheDocument();
    expect(within(css!).queryByLabelText("編集済み")).toBeNull();
    expect(within(js!).queryByLabelText("編集済み")).toBeNull();
  });

  it("タブを押すとそのパスで onSelect が呼ばれる", () => {
    const onSelect = vi.fn();
    render(<FileTabs files={files} activePath="index.html" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("tab", { name: "main.js" }));
    expect(onSelect).toHaveBeenCalledWith("js/main.js");
  });

  it("onClose を渡すと閉じるボタンを出す", () => {
    const onClose = vi.fn();
    const { rerender } = render(<FileTabs files={files} activePath={null} onSelect={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /閉じる/ })).toBeNull();

    rerender(<FileTabs files={files} activePath={null} onSelect={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "css/style.css を閉じる" }));
    expect(onClose).toHaveBeenCalledWith("css/style.css");
  });

  it("同じファイル名が複数あればパス全体を表示する", () => {
    render(
      <FileTabs
        files={[{ path: "index.html" }, { path: "about/index.html" }, { path: "a.css" }]}
        activePath={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "index.html",
      "about/index.html",
      "a.css",
    ]);
  });
});
