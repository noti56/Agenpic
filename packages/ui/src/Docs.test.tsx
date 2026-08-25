import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DocRecord } from "@agenpic/types";
import { DocsPanel } from "./Docs";

vi.mock("@toast-ui/editor", () => ({
  default: class MockEditor {
    private markdown: string;
    constructor(opts: { initialValue?: string }) {
      this.markdown = opts.initialValue ?? "";
    }
    getMarkdown() {
      return this.markdown;
    }
    on() {}
    destroy() {}
  },
}));

vi.mock("@toast-ui/editor/dist/toastui-editor-viewer", () => ({
  default: class MockViewer {
    constructor() {}
    destroy() {}
  },
}));

function makeDoc(overrides: Partial<DocRecord>): DocRecord {
  return {
    id: "d1",
    project: "p1",
    slug: "getting-started",
    title: "Getting Started",
    content: "# Getting Started\n\nHello.",
    created: "",
    updated: "",
    ...overrides,
  };
}

describe("DocsPanel", () => {
  it("shows an empty state with no docs", () => {
    render(<DocsPanel docs={[]} canEdit onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/no docs yet/i)).toBeInTheDocument();
  });

  it("selects the first doc by default and shows its title/slug", () => {
    const docs = [makeDoc({ id: "a", slug: "alpha", title: "Alpha" }), makeDoc({ id: "b", slug: "beta", title: "Beta" })];
    render(<DocsPanel docs={docs} canEdit onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByDisplayValue("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("switches the detail pane when another doc is selected", async () => {
    const user = userEvent.setup();
    const docs = [makeDoc({ id: "a", slug: "alpha", title: "Alpha" }), makeDoc({ id: "b", slug: "beta", title: "Beta" })];
    render(<DocsPanel docs={docs} canEdit onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);

    await user.click(screen.getByText("Beta"));
    expect(screen.getByDisplayValue("Beta")).toBeInTheDocument();
  });

  it("disables editing and hides delete/new affordances for viewers", () => {
    const docs = [makeDoc({})];
    render(<DocsPanel docs={docs} canEdit={false} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByDisplayValue("Getting Started")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new doc/i })).not.toBeInTheDocument();
  });

  it("saves the title on blur when it changed", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const docs = [makeDoc({})];
    render(<DocsPanel docs={docs} canEdit onCreate={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} />);

    const input = screen.getByDisplayValue("Getting Started");
    await user.clear(input);
    await user.type(input, "New Title");
    await user.tab();

    expect(onUpdate).toHaveBeenCalledWith("d1", { title: "New Title" });
  });

  it("calls onDelete with the doc id", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const docs = [makeDoc({})];
    render(<DocsPanel docs={docs} canEdit onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith("d1");
  });

  it("creates a new doc with a slugified slug derived from the title", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<DocsPanel docs={[]} canEdit onCreate={onCreate} onUpdate={vi.fn()} onDelete={vi.fn()} />);

    await user.click(screen.getAllByRole("button", { name: /new doc/i })[0]);
    await user.type(screen.getByLabelText(/title/i), "My New Doc!");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(onCreate).toHaveBeenCalledWith({ slug: "my-new-doc", title: "My New Doc!" });
  });

  it("rejects creating a doc with a slug that already exists", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const docs = [makeDoc({ slug: "dup", title: "Dup" })];
    render(<DocsPanel docs={docs} canEdit onCreate={onCreate} onUpdate={vi.fn()} onDelete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /new doc/i }));
    await user.type(screen.getByLabelText(/title/i), "Dup");
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText(/already exists/i)).toBeInTheDocument();
  });
});
