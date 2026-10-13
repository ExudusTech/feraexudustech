import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import SuperAdminSelector from "@/pages/SuperAdminSelector";
const mocks = vi.hoisted(() => ({ switchOrg: vi.fn(async () => {}), user: { role: "super_admin", name: "PH" } }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: mocks.user, session: {}, isLoading: false, switchOrganization: mocks.switchOrg }) }));
vi.mock("@/hooks/use-organizations", () => ({ useAllOrganizations: () => ({ isLoading: false, data: [{ id: "org", name: "NitsClean", is_active: true }] }) }));
afterEach(() => { cleanup(); mocks.switchOrg.mockReset(); });
describe("Organization destination", () => {
  it.each(["/agenda?agendamento=visit", "/leads?lead=lead"])("awaits selection before restoring %s", async path => {
    let complete: (() => void) | undefined;
    mocks.switchOrg.mockImplementation(() => new Promise<void>(resolve => { complete = resolve; }));
    render(<MemoryRouter initialEntries={[`/admin/selecionar-organizacao?returnTo=${encodeURIComponent(path)}`]}><Routes>
      <Route path="/admin/selecionar-organizacao" element={<SuperAdminSelector />} />
      <Route path={path.split("?")[0]} element={<div>Destino preservado</div>} />
    </Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /NitsClean/ }));
    expect(mocks.switchOrg).toHaveBeenCalledWith("org");
    expect(screen.queryByText("Destino preservado")).not.toBeInTheDocument();
    complete?.();
    await waitFor(() => expect(screen.getByText("Destino preservado")).toBeInTheDocument());
  });
});