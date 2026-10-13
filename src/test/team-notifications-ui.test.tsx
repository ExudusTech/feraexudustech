import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TeamNotifications from "@/components/settings/TeamNotifications";
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
const mocks = vi.hoisted(() => ({ save: vi.fn(async () => {}), mutate: vi.fn(), role: "gestor" }));
vi.mock("@/hooks/use-permissions", () => ({ usePermissions: () => ({ role: mocks.role, isAdmin: false }) }));
vi.mock("@/hooks/use-team-notifications", async importOriginal => {
  const actual = await importOriginal<typeof import("@/hooks/use-team-notifications")>();
  return { ...actual, useTeamRecipients: () => ({ data: [{ id: "test", nome: "PH (teste)", whatsapp: "5521995367752", email: null, papel: "gestor", eventos: ["agendamento"], ativo: true }], isLoading: false }),
    useSaveTeamRecipient: () => ({ mutateAsync: mocks.save, mutate: mocks.mutate, isPending: false }) };
});
afterEach(() => { cleanup(); mocks.save.mockClear(); mocks.mutate.mockClear(); mocks.role = "gestor"; });
describe("Team recipient management", () => {
  it("offers only the three supported events", () => {
    render(<TeamNotifications />);
    fireEvent.click(screen.getByRole("button", { name: "Novo destinatário" }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.getByLabelText("Agendamento")).toBeInTheDocument();
    expect(screen.getByLabelText("Transferência")).toBeInTheDocument();
    expect(screen.getByLabelText("Lead da Matriz")).toBeInTheDocument();
    expect(screen.queryByLabelText("Fora de cobertura")).not.toBeInTheDocument();
  });
  it("gestor creates a recipient with event subscriptions", async () => {
    render(<TeamNotifications />);
    fireEvent.click(screen.getByRole("button", { name: "Novo destinatário" }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Comercial" } });
    fireEvent.change(screen.getByLabelText("WhatsApp (com código do país, sem +)"), { target: { value: "5521999999999" } });
    fireEvent.click(screen.getByLabelText("Transferência"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar destinatário" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ nome: "Comercial", eventos: ["transferencia"], ativo: true })));
  });
  it("edits an existing recipient and toggles active state", async () => {
    render(<TeamNotifications />);
    fireEvent.click(screen.getByRole("switch", { name: "Ativar PH (teste)" }));
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ id: "test", ativo: false }));
    fireEvent.click(screen.getByRole("button", { name: "Editar PH (teste)" }));
    expect(screen.getByLabelText("Nome")).toHaveValue("PH (teste)");
    fireEvent.click(screen.getByLabelText("Lead da Matriz"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar destinatário" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ id: "test", eventos: ["agendamento", "lead_matriz"] })));
  });
  it("read-only users cannot change recipients", () => {
    mocks.role = "vendedor"; render(<TeamNotifications />);
    expect(screen.queryByRole("button", { name: "Novo destinatário" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Ativar PH (teste)" })).toBeDisabled();
  });
});