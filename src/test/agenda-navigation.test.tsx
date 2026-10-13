import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Agenda from "@/pages/Agenda";
import { destinationFrom, safeReturnTo } from "@/lib/return-to";
const mocks = vi.hoisted(() => ({ role: "super_admin" }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "me", role: mocks.role, organization_id: "org" } }) }));
vi.mock("@/components/layout/AppLayout", () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/hooks/use-schedules", () => ({ useSchedules: () => ({ isLoading: false, data: [{ id: "flora-visit", title: "Visita Técnica — Cabo Frio Shopping", source: "flora", assigned_to: null, created_by: null, scheduled_date: "2026-10-16", start_time: "14:00:00", status: "agendado", location: "Cabo Frio" }] }), useDeleteSchedule: () => ({ mutate: vi.fn() }) }));
vi.mock("@/hooks/use-users", () => ({ useOrganizationUsers: () => ({ data: [] }) }));
vi.mock("@/hooks/use-leads", () => ({ useLeads: () => ({ data: [] }) }));
vi.mock("@/components/ekkoa/ScheduleFormDialog", () => ({ default: ({ open, schedule }: any) => open ? <div role="dialog">{schedule?.title}</div> : null }));
afterEach(() => { cleanup(); mocks.role = "super_admin"; });
describe("Agenda and notification destinations", () => {
  it.each(["admin", "gestor", "super_admin"])("%s defaults to all, including unassigned Flora visits", role => {
    mocks.role = role; render(<MemoryRouter><Agenda /></MemoryRouter>);
    expect(screen.getByRole("tab", { name: "Todas" })).toHaveAttribute("data-state", "active");
    expect(screen.getByText("Flora")).toBeInTheDocument();
    expect(screen.getByText("Sem responsável")).toBeInTheDocument();
  });
  it.each(["vendedor", "consultor_tecnico"])("%s retains own agendas", role => {
    mocks.role = role; render(<MemoryRouter><Agenda /></MemoryRouter>);
    expect(screen.queryByRole("tab", { name: "Todas" })).not.toBeInTheDocument();
    expect(screen.queryByText("Flora")).not.toBeInTheDocument();
  });
  it("opens a linked visit and displays Flora on the calendar", async () => {
    render(<MemoryRouter initialEntries={["/agenda?agendamento=flora-visit"]}><Agenda /></MemoryRouter>);
    expect(screen.getByRole("dialog")).toHaveTextContent("Cabo Frio Shopping");
    fireEvent.click(screen.getByRole("button", { name: "Calendário" }));
    await waitFor(() => expect(screen.getByText("Flora")).toBeInTheDocument());
  });
  it.each(["/agenda?agendamento=visit", "/leads?lead=lead"])("keeps %s across reloadable redirects", path => {
    const query = `?returnTo=${encodeURIComponent(path)}`;
    expect(destinationFrom(query, null)).toBe(path);
    expect(destinationFrom("", { returnTo: path })).toBe(path);
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/auth", "/admin/selecionar-organizacao"])("rejects unsafe destination %s", path => {
    expect(safeReturnTo(path)).toBe("/dashboard");
  });
});