import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TicketRecord } from "@agenpic/types";
import { MissionHangarBoard } from "./MissionHangar";

function makeTicket(overrides: Partial<TicketRecord>): TicketRecord {
  return {
    id: "t1",
    project: "p1",
    slug: "t1",
    title: "Untitled",
    description: "",
    column: "backlog",
    order: 0,
    owner: "",
    images: [],
    created: "",
    updated: "",
    ...overrides,
  };
}

describe("MissionHangarBoard", () => {
  it("renders all four columns", () => {
    render(<MissionHangarBoard tickets={[]} onMove={vi.fn()} />);
    expect(screen.getByText("Backlog")).toBeInTheDocument();
    expect(screen.getByText("To Do")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("places tickets into their matching column", () => {
    const tickets = [
      makeTicket({ id: "a", title: "Backlog card", column: "backlog" }),
      makeTicket({ id: "b", title: "Done card", column: "done" }),
    ];
    render(<MissionHangarBoard tickets={tickets} onMove={vi.fn()} />);

    const backlogColumn = screen.getByText("Backlog").closest("div")!.parentElement!;
    expect(within(backlogColumn).getByText("Backlog card")).toBeInTheDocument();
    expect(within(backlogColumn).queryByText("Done card")).not.toBeInTheDocument();

    const doneColumn = screen.getByText("Done").closest("div")!.parentElement!;
    expect(within(doneColumn).getByText("Done card")).toBeInTheDocument();
  });

  it("shows a per-column count that updates with the ticket list", () => {
    const tickets = [
      makeTicket({ id: "a", title: "One", column: "todo" }),
      makeTicket({ id: "b", title: "Two", column: "todo" }),
    ];
    render(<MissionHangarBoard tickets={tickets} onMove={vi.fn()} />);
    const todoColumn = screen.getByText("To Do").parentElement!.parentElement!;
    expect(within(todoColumn).getByText("2")).toBeInTheDocument();
  });

  it("creates a ticket via the add-card form and calls onCreate with the right column", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<MissionHangarBoard tickets={[]} onMove={vi.fn()} onCreate={onCreate} />);

    const addButtons = screen.getAllByRole("button", { name: /Add ticket to/i });
    await user.click(addButtons[1]); // "To Do" column
    await user.type(screen.getByPlaceholderText("Ticket title…"), "New task");
    await user.keyboard("{Enter}");

    expect(onCreate).toHaveBeenCalledWith("todo", "New task");
  });

  it("calls onDelete when a card's delete button is clicked", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const tickets = [makeTicket({ id: "a", title: "Removable", column: "backlog" })];
    render(<MissionHangarBoard tickets={tickets} onMove={vi.fn()} onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: /delete ticket/i }));
    expect(onDelete).toHaveBeenCalledWith("a");
  });

  it("hides add and delete controls in readOnly mode", () => {
    const tickets = [makeTicket({ id: "a", title: "Locked", column: "backlog" })];
    render(<MissionHangarBoard tickets={tickets} onMove={vi.fn()} readOnly />);

    expect(screen.queryByRole("button", { name: /Add ticket to/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete ticket/i })).not.toBeInTheDocument();
  });
});
