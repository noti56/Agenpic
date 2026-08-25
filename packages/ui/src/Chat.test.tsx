import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MessageRecord } from "@agenpic/types";
import { ChatPanel } from "./Chat";

function makeMessage(overrides: Partial<MessageRecord>): MessageRecord {
  return {
    id: "m1",
    project: "p1",
    user: "u1",
    text: "hello",
    flagged: false,
    flaggedBy: "",
    flaggedAt: "",
    created: "",
    ...overrides,
  };
}

describe("ChatPanel", () => {
  it("shows an empty state with no messages", () => {
    render(<ChatPanel messages={[]} currentUserId="u1" onSend={vi.fn()} onToggleFlag={vi.fn()} />);
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });

  it("renders message text and the other user's name, but not the current user's own name", () => {
    const messages = [
      makeMessage({ id: "a", user: "u1", text: "from me" }),
      makeMessage({
        id: "b",
        user: "u2",
        text: "from them",
        expand: { user: { id: "u2", email: "them@x.com", name: "Them", avatar: "", created: "", updated: "" } },
      }),
    ];
    render(<ChatPanel messages={messages} currentUserId="u1" onSend={vi.fn()} onToggleFlag={vi.fn()} />);

    expect(screen.getByText("from me")).toBeInTheDocument();
    expect(screen.getByText("from them")).toBeInTheDocument();
    expect(screen.getByText("Them")).toBeInTheDocument();
  });

  it("sends a trimmed message and clears the input", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} currentUserId="u1" onSend={onSend} onToggleFlag={vi.fn()} />);

    const input = screen.getByPlaceholderText(/message the team/i);
    await user.type(input, "  hi there  ");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(onSend).toHaveBeenCalledWith("hi there");
    expect(input).toHaveValue("");
  });

  it("disables the send button when the draft is empty", () => {
    render(<ChatPanel messages={[]} currentUserId="u1" onSend={vi.fn()} onToggleFlag={vi.fn()} />);
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });

  it("flags a message via the right-click context menu", async () => {
    const user = userEvent.setup();
    const onToggleFlag = vi.fn();
    const messages = [makeMessage({ id: "a", user: "u1", text: "flag me", flagged: false })];
    render(<ChatPanel messages={messages} currentUserId="u1" onSend={vi.fn()} onToggleFlag={onToggleFlag} />);

    await user.pointer({ keys: "[MouseRight]", target: screen.getByText("flag me") });
    await user.click(screen.getByRole("button", { name: /flag message/i }));

    expect(onToggleFlag).toHaveBeenCalledWith("a", true);
  });

  it("shows 'Remove flag' for an already-flagged message", async () => {
    const user = userEvent.setup();
    const messages = [makeMessage({ id: "a", user: "u1", text: "already flagged", flagged: true })];
    render(<ChatPanel messages={messages} currentUserId="u1" onSend={vi.fn()} onToggleFlag={vi.fn()} />);

    await user.pointer({ keys: "[MouseRight]", target: screen.getByText("already flagged") });
    expect(screen.getByRole("button", { name: /remove flag/i })).toBeInTheDocument();
  });
});
