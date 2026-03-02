import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2, Wrench, CalendarDays, Package, AlertTriangle, Users, Target, Cpu, Zap, FileText, DollarSign, Flower2, MapPin, ClipboardCheck, LayoutGrid, List } from "lucide-react";

import { useOperations, useDeleteOperation, STATUS_CONFIG, type Operation } from "@/hooks/use-operations";
import { useSchedules, useDeleteSchedule, type Schedule } from "@/hooks/use-schedules";
import { useInventory, useDeleteInventoryItem, type InventoryItem } from "@/hooks/use-inventory";
import { useEkkoaClients, useDeleteEkkoaClient, type EkkoaClient } from "@/hooks/use-ekkoa-clients";
import { useEkkoaLeads, useDeleteEkkoaLead, type EkkoaLead } from "@/hooks/use-ekkoa-leads";
import { useEkkoaEquipment, useDeleteEkkoaEquipment, type EkkoaEquipment } from "@/hooks/use-ekkoa-equipment";
import { useEkkoaInstallations, useDeleteEkkoaInstallation, type EkkoaInstallation } from "@/hooks/use-ekkoa-installations";
import { useEkkoaContracts, useDeleteEkkoaContract, type EkkoaContract } from "@/hooks/use-ekkoa-contracts";
import { useEkkoaBilling, useDeleteEkkoaBilling, type EkkoaBilling } from "@/hooks/use-ekkoa-billing";
import { useEkkoaFragranceLines, useDeleteEkkoaFragranceLine, type EkkoaFragranceLine } from "@/hooks/use-ekkoa-fragrance-lines";
import { useEkkoaCoverageAreas, useDeleteEkkoaCoverageArea, type EkkoaCoverageArea } from "@/hooks/use-ekkoa-coverage-areas";
import { useEkkoaTechnicalVisits, useDeleteEkkoaTechnicalVisit, type EkkoaTechnicalVisit } from "@/hooks/use-ekkoa-technical-visits";

import OperationFormDialog from "@/components/ekkoa/OperationFormDialog";
import ScheduleFormDialog from "@/components/ekkoa/ScheduleFormDialog";
import InventoryFormDialog from "@/components/ekkoa/InventoryFormDialog";
import EkkoaClientFormDialog from "@/components/ekkoa/EkkoaClientFormDialog";
import EkkoaLeadFormDialog from "@/components/ekkoa/EkkoaLeadFormDialog";
import EkkoaEquipmentFormDialog from "@/components/ekkoa/EkkoaEquipmentFormDialog";
import EkkoaInstallationFormDialog from "@/components/ekkoa/EkkoaInstallationFormDialog";
import EkkoaContractFormDialog from "@/components/ekkoa/EkkoaContractFormDialog";
import EkkoaBillingFormDialog from "@/components/ekkoa/EkkoaBillingFormDialog";
import EkkoaFragranceLineFormDialog from "@/components/ekkoa/EkkoaFragranceLineFormDialog";
import EkkoaCoverageAreaFormDialog from "@/components/ekkoa/EkkoaCoverageAreaFormDialog";
import EkkoaTechnicalVisitFormDialog from "@/components/ekkoa/EkkoaTechnicalVisitFormDialog";

import OperationsKanban from "@/components/ekkoa/OperationsKanban";
import ExpiringTestsAlert from "@/components/ekkoa/ExpiringTestsAlert";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

type TabKey = "equipamentos" | "instalacoes" | "contratos" | "faturamento" | "operacoes" | "agendamentos" | "inventario" | "fragancias" | "visitas_tecnicas";

const TAB_CONFIG: Record<TabKey, { label: string; icon: React.ElementType; newLabel: string }> = {
  equipamentos: { label: "Equipamentos", icon: Cpu, newLabel: "Novo Equipamento" },
  instalacoes: { label: "Instalações", icon: Zap, newLabel: "Nova Instalação" },
  contratos: { label: "Contratos", icon: FileText, newLabel: "Novo Contrato" },
  faturamento: { label: "Faturamento", icon: DollarSign, newLabel: "Novo Faturamento" },
  operacoes: { label: "Operações", icon: Wrench, newLabel: "Nova Operação" },
  agendamentos: { label: "Agendamentos", icon: CalendarDays, newLabel: "Novo Agendamento" },
  inventario: { label: "Inventário", icon: Package, newLabel: "Novo Item" },
  fragancias: { label: "Fragrâncias", icon: Flower2, newLabel: "Nova Fragrância" },
  visitas_tecnicas: { label: "Visitas Téc.", icon: ClipboardCheck, newLabel: "Nova Visita" },
};

const BRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function Ekkoa() {
  const [tab, setTab] = useState<TabKey>("equipamentos");
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<{ type: TabKey; id: string } | null>(null);
  const [opsView, setOpsView] = useState<"list" | "kanban">("list");

  const { data: operations = [], isLoading: opsLoading } = useOperations();
  const deleteOp = useDeleteOperation();
  const [opDialog, setOpDialog] = useState(false);
  const [selectedOp, setSelectedOp] = useState<Operation | null>(null);

  const { data: schedules = [], isLoading: schLoading } = useSchedules();
  const deleteSch = useDeleteSchedule();
  const [schDialog, setSchDialog] = useState(false);
  const [selectedSch, setSelectedSch] = useState<Schedule | null>(null);

  const { data: inventory = [], isLoading: invLoading } = useInventory();
  const deleteInv = useDeleteInventoryItem();
  const [invDialog, setInvDialog] = useState(false);
  const [selectedInv, setSelectedInv] = useState<InventoryItem | null>(null);

  const { data: ekClients = [], isLoading: ekCliLoading } = useEkkoaClients();
  const deleteEkCli = useDeleteEkkoaClient();
  const [ekCliDialog, setEkCliDialog] = useState(false);
  const [selectedEkCli, setSelectedEkCli] = useState<EkkoaClient | null>(null);

  const { data: ekLeads = [], isLoading: ekLeadLoading } = useEkkoaLeads();
  const deleteEkLead = useDeleteEkkoaLead();
  const [ekLeadDialog, setEkLeadDialog] = useState(false);
  const [selectedEkLead, setSelectedEkLead] = useState<EkkoaLead | null>(null);

  const { data: ekEquip = [], isLoading: ekEquipLoading } = useEkkoaEquipment();
  const deleteEkEquip = useDeleteEkkoaEquipment();
  const [ekEquipDialog, setEkEquipDialog] = useState(false);
  const [selectedEkEquip, setSelectedEkEquip] = useState<EkkoaEquipment | null>(null);

  const { data: ekInstall = [], isLoading: ekInstallLoading } = useEkkoaInstallations();
  const deleteEkInstall = useDeleteEkkoaInstallation();
  const [ekInstallDialog, setEkInstallDialog] = useState(false);
  const [selectedEkInstall, setSelectedEkInstall] = useState<EkkoaInstallation | null>(null);

  const { data: ekContracts = [], isLoading: ekContractLoading } = useEkkoaContracts();
  const deleteEkContract = useDeleteEkkoaContract();
  const [ekContractDialog, setEkContractDialog] = useState(false);
  const [selectedEkContract, setSelectedEkContract] = useState<EkkoaContract | null>(null);

  const { data: ekBilling = [], isLoading: ekBillingLoading } = useEkkoaBilling();
  const deleteEkBilling = useDeleteEkkoaBilling();
  const [ekBillingDialog, setEkBillingDialog] = useState(false);
  const [selectedEkBilling, setSelectedEkBilling] = useState<EkkoaBilling | null>(null);

  const { data: fragrances = [], isLoading: fragLoading } = useEkkoaFragranceLines();
  const deleteFrag = useDeleteEkkoaFragranceLine();
  const [fragDialog, setFragDialog] = useState(false);
  const [selectedFrag, setSelectedFrag] = useState<EkkoaFragranceLine | null>(null);

  const { data: coverageAreas = [], isLoading: areasLoading } = useEkkoaCoverageAreas();
  const deleteArea = useDeleteEkkoaCoverageArea();
  const [areaDialog, setAreaDialog] = useState(false);
  const [selectedArea, setSelectedArea] = useState<EkkoaCoverageArea | null>(null);

  const { data: techVisits = [], isLoading: tvLoading } = useEkkoaTechnicalVisits();
  const deleteTv = useDeleteEkkoaTechnicalVisit();
  const [tvDialog, setTvDialog] = useState(false);
  const [selectedTv, setSelectedTv] = useState<EkkoaTechnicalVisit | null>(null);

  const s = search.toLowerCase();

  const handleNew = () => {
    const actions: Record<TabKey, () => void> = {
      equipamentos: () => { setSelectedEkEquip(null); setEkEquipDialog(true); },
      instalacoes: () => { setSelectedEkInstall(null); setEkInstallDialog(true); },
      contratos: () => { setSelectedEkContract(null); setEkContractDialog(true); },
      faturamento: () => { setSelectedEkBilling(null); setEkBillingDialog(true); },
      operacoes: () => { setSelectedOp(null); setOpDialog(true); },
      agendamentos: () => { setSelectedSch(null); setSchDialog(true); },
      inventario: () => { setSelectedInv(null); setInvDialog(true); },
      fragancias: () => { setSelectedFrag(null); setFragDialog(true); },
      visitas_tecnicas: () => { setSelectedTv(null); setTvDialog(true); },
    };
    actions[tab]();
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const deleters: Record<TabKey, (id: string) => void> = {
      equipamentos: (id) => deleteEkEquip.mutate(id),
      instalacoes: (id) => deleteEkInstall.mutate(id),
      contratos: (id) => deleteEkContract.mutate(id),
      faturamento: (id) => deleteEkBilling.mutate(id),
      operacoes: (id) => deleteOp.mutate(id),
      agendamentos: (id) => deleteSch.mutate(id),
      inventario: (id) => deleteInv.mutate(id),
      fragancias: (id) => deleteFrag.mutate(id),
      visitas_tecnicas: (id) => deleteTv.mutate(id),
    };
    deleters[deleteId.type](deleteId.id);
    setDeleteId(null);
  };

  return (
    <AppLayout
      title="Ekkoa"
      subtitle="Gestão completa do módulo Ekkoa"
      actions={<Button onClick={handleNew}><Plus className="h-4 w-4 mr-2" />{TAB_CONFIG[tab].newLabel}</Button>}
    >
      {/* Expiring Test Alerts */}
      <ExpiringTestsAlert
        operations={operations}
        onSelect={(op) => { setSelectedOp(op); setOpDialog(true); setTab("operacoes"); }}
      />

      <Tabs value={tab} onValueChange={(v) => { setTab(v as TabKey); setSearch(""); }} className="space-y-4">
        <ScrollArea className="w-full">
          <TabsList className="inline-flex w-auto">
            {(Object.keys(TAB_CONFIG) as TabKey[]).map((key) => {
              const { label, icon: Icon } = TAB_CONFIG[key];
              return <TabsTrigger key={key} value={key} className="gap-2"><Icon className="h-4 w-4" />{label}</TabsTrigger>;
            })}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>



        {/* Equipamentos */}
        <TabsContent value="equipamentos">
          <DataTable loading={ekEquipLoading} empty={ekEquip.length === 0} filtered={ekEquip.filter((e) => [e.name, e.brand, e.category].some((f) => f?.toLowerCase().includes(s))).length === 0 && ekEquip.length > 0} icon={<Cpu className="h-12 w-12" />} search={search} onAdd={handleNew}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nome</TableHead><TableHead>Marca</TableHead><TableHead>Modelo</TableHead><TableHead>Categoria</TableHead><TableHead>Potência</TableHead><TableHead>Qtd.</TableHead><TableHead>Status</TableHead><TableHead className="w-10" />
              </TableRow></TableHeader>
              <TableBody>
                {ekEquip.filter((e) => [e.name, e.brand, e.category].some((f) => f?.toLowerCase().includes(s))).map((e) => (
                  <TableRow key={e.id} className="cursor-pointer" onClick={() => { setSelectedEkEquip(e); setEkEquipDialog(true); }}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell>{e.brand || "—"}</TableCell>
                    <TableCell>{e.model || "—"}</TableCell>
                    <TableCell>{e.category || "—"}</TableCell>
                    <TableCell>{e.power_watts ? `${e.power_watts}W` : "—"}</TableCell>
                    <TableCell>{e.quantity}</TableCell>
                    <TableCell><Badge variant={e.status === "disponivel" ? "default" : e.status === "em_uso" ? "secondary" : "destructive"}>{e.status}</Badge></TableCell>
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      <ActionMenu onEdit={() => { setSelectedEkEquip(e); setEkEquipDialog(true); }} onDelete={() => setDeleteId({ type: "equipamentos", id: e.id })} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTable>
        </TabsContent>

        {/* Instalações */}
        <TabsContent value="instalacoes">
          <DataTable loading={ekInstallLoading} empty={ekInstall.length === 0} filtered={ekInstall.filter((i) => [i.title, i.city, i.address].some((f) => f?.toLowerCase().includes(s))).length === 0 && ekInstall.length > 0} icon={<Zap className="h-12 w-12" />} search={search} onAdd={handleNew}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Título</TableHead><TableHead>Tipo</TableHead><TableHead>kWp</TableHead><TableHead>Painéis</TableHead><TableHead>Cidade</TableHead><TableHead>Status</TableHead><TableHead className="w-10" />
              </TableRow></TableHeader>
              <TableBody>
                {ekInstall.filter((i) => [i.title, i.city, i.address].some((f) => f?.toLowerCase().includes(s))).map((i) => (
                  <TableRow key={i.id} className="cursor-pointer" onClick={() => { setSelectedEkInstall(i); setEkInstallDialog(true); }}>
                    <TableCell className="font-medium">{i.title}</TableCell>
                    <TableCell><Badge variant="secondary">{i.installation_type}</Badge></TableCell>
                    <TableCell>{i.power_kwp ? `${i.power_kwp} kWp` : "—"}</TableCell>
                    <TableCell>{i.panels_count || "—"}</TableCell>
                    <TableCell>{i.city || "—"}</TableCell>
                    <TableCell><Badge variant={i.status === "concluida" ? "default" : i.status === "cancelada" ? "destructive" : "secondary"}>{i.status}</Badge></TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <ActionMenu onEdit={() => { setSelectedEkInstall(i); setEkInstallDialog(true); }} onDelete={() => setDeleteId({ type: "instalacoes", id: i.id })} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTable>
        </TabsContent>

        {/* Contratos */}
        <TabsContent value="contratos">
          <DataTable loading={ekContractLoading} empty={ekContracts.length === 0} filtered={ekContracts.filter((c) => [c.title, c.contract_number].some((f) => f?.toLowerCase().includes(s))).length === 0 && ekContracts.length > 0} icon={<FileText className="h-12 w-12" />} search={search} onAdd={handleNew}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Título</TableHead><TableHead>Nº</TableHead><TableHead>Tipo</TableHead><TableHead>Valor Total</TableHead><TableHead>Mensal</TableHead><TableHead>Status</TableHead><TableHead className="w-10" />
              </TableRow></TableHeader>
              <TableBody>
                {ekContracts.filter((c) => [c.title, c.contract_number].some((f) => f?.toLowerCase().includes(s))).map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => { setSelectedEkContract(c); setEkContractDialog(true); }}>
                    <TableCell className="font-medium">{c.title}</TableCell>
                    <TableCell className="text-muted-foreground">{c.contract_number || "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{c.contract_type}</Badge></TableCell>
                    <TableCell>{BRL(c.total_value)}</TableCell>
                    <TableCell>{c.monthly_value ? BRL(c.monthly_value) : "—"}</TableCell>
                    <TableCell><Badge variant={c.status === "ativo" ? "default" : c.status === "cancelado" ? "destructive" : "secondary"}>{c.status}</Badge></TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <ActionMenu onEdit={() => { setSelectedEkContract(c); setEkContractDialog(true); }} onDelete={() => setDeleteId({ type: "contratos", id: c.id })} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTable>
        </TabsContent>

        {/* Faturamento */}
        <TabsContent value="faturamento">
          <DataTable loading={ekBillingLoading} empty={ekBilling.length === 0} filtered={ekBilling.filter((b) => [b.title, b.invoice_number].some((f) => f?.toLowerCase().includes(s))).length === 0 && ekBilling.length > 0} icon={<DollarSign className="h-12 w-12" />} search={search} onAdd={handleNew}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Título</TableHead><TableHead>Nº Fatura</TableHead><TableHead>Tipo</TableHead><TableHead>Valor</TableHead><TableHead>Vencimento</TableHead><TableHead>Status</TableHead><TableHead className="w-10" />
              </TableRow></TableHeader>
              <TableBody>
                {ekBilling.filter((b) => [b.title, b.invoice_number].some((f) => f?.toLowerCase().includes(s))).map((b) => (
                  <TableRow key={b.id} className="cursor-pointer" onClick={() => { setSelectedEkBilling(b); setEkBillingDialog(true); }}>
                    <TableCell className="font-medium">{b.title}</TableCell>
                    <TableCell className="text-muted-foreground">{b.invoice_number || "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{b.billing_type}</Badge></TableCell>
                    <TableCell>{BRL(b.amount)}</TableCell>
                    <TableCell>{b.due_date ? new Date(b.due_date + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                    <TableCell><Badge variant={b.status === "pago" ? "default" : b.status === "atrasado" ? "destructive" : "secondary"}>{b.status}</Badge></TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <ActionMenu onEdit={() => { setSelectedEkBilling(b); setEkBillingDialog(true); }} onDelete={() => setDeleteId({ type: "faturamento", id: b.id })} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTable>
        </TabsContent>

        {/* Operações */}
        <TabsContent value="operacoes">
          <div className="flex items-center gap-2 mb-4">
            <Button variant={opsView === "list" ? "default" : "outline"} size="sm" onClick={() => setOpsView("list")}>
              <List className="h-4 w-4 mr-1" />Lista
            </Button>
            <Button variant={opsView === "kanban" ? "default" : "outline"} size="sm" onClick={() => setOpsView("kanban")}>
              <LayoutGrid className="h-4 w-4 mr-1" />Kanban
            </Button>
          </div>
          {opsView === "kanban" ? (
            <OperationsKanban onEdit={(op) => { setSelectedOp(op); setOpDialog(true); }} />
          ) : (
            <DataTable loading={opsLoading} empty={operations.length === 0} filtered={operations.filter((o) => [o.title, o.location].some((f) => f?.toLowerCase().includes(s))).length === 0 && operations.length > 0} icon={<Wrench className="h-12 w-12" />} search={search} onAdd={handleNew}>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Título</TableHead><TableHead>Status</TableHead><TableHead>Prioridade</TableHead><TableHead>Local</TableHead><TableHead>Início</TableHead><TableHead className="w-10" />
                </TableRow></TableHeader>
                <TableBody>
                  {operations.filter((o) => [o.title, o.location].some((f) => f?.toLowerCase().includes(s))).map((o) => (
                    <TableRow key={o.id} className="cursor-pointer" onClick={() => { setSelectedOp(o); setOpDialog(true); }}>
                      <TableCell className="font-medium">{o.title}</TableCell>
                      <TableCell><div className="flex items-center gap-2"><div className={`h-2 w-2 rounded-full ${STATUS_CONFIG[o.status].color}`} />{STATUS_CONFIG[o.status].label}</div></TableCell>
                      <TableCell><Badge variant={o.priority === "alta" || o.priority === "urgente" ? "destructive" : o.priority === "media" ? "default" : "secondary"}>{o.priority.charAt(0).toUpperCase() + o.priority.slice(1)}</Badge></TableCell>
                      <TableCell>{o.location || "—"}</TableCell>
                      <TableCell>{o.start_date ? new Date(o.start_date).toLocaleDateString("pt-BR") : "—"}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <ActionMenu onEdit={() => { setSelectedOp(o); setOpDialog(true); }} onDelete={() => setDeleteId({ type: "operacoes", id: o.id })} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataTable>
          )}
        </TabsContent>

        {/* Agendamentos */}
        <TabsContent value="agendamentos">
          <DataTable loading={schLoading} empty={schedules.length === 0} filtered={schedules.filter((s2) => [s2.title, s2.location].some((f) => f?.toLowerCase().includes(s))).length === 0 && schedules.length > 0} icon={<CalendarDays className="h-12 w-12" />} search={search} onAdd={handleNew}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Título</TableHead><TableHead>Data</TableHead><TableHead>Horário</TableHead><TableHead>Status</TableHead><TableHead>Local</TableHead><TableHead className="w-10" />
              </TableRow></TableHeader>
              <TableBody>
                {schedules.filter((s2) => [s2.title, s2.location].some((f) => f?.toLowerCase().includes(s))).map((s2) => (
                  <TableRow key={s2.id} className="cursor-pointer" onClick={() => { setSelectedSch(s2); setSchDialog(true); }}>
                    <TableCell className="font-medium">{s2.title}</TableCell>
                    <TableCell>{new Date(s2.scheduled_date + "T12:00:00").toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>{s2.start_time ? `${s2.start_time.slice(0, 5)}${s2.end_time ? ` - ${s2.end_time.slice(0, 5)}` : ""}` : "—"}</TableCell>
                    <TableCell><Badge variant={s2.status === "cancelado" ? "destructive" : s2.status === "realizado" ? "default" : "secondary"}>{s2.status.charAt(0).toUpperCase() + s2.status.slice(1)}</Badge></TableCell>
                    <TableCell>{s2.location || "—"}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <ActionMenu onEdit={() => { setSelectedSch(s2); setSchDialog(true); }} onDelete={() => setDeleteId({ type: "agendamentos", id: s2.id })} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTable>
        </TabsContent>

        {/* Inventário */}
        <TabsContent value="inventario">
          <DataTable loading={invLoading} empty={inventory.length === 0} filtered={inventory.filter((i) => [i.name, i.sku, i.category].some((f) => f?.toLowerCase().includes(s))).length === 0 && inventory.length > 0} icon={<Package className="h-12 w-12" />} search={search} onAdd={handleNew}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nome</TableHead><TableHead>SKU</TableHead><TableHead>Categoria</TableHead><TableHead>Qtd.</TableHead><TableHead>Custo Unit.</TableHead><TableHead>Alerta</TableHead><TableHead className="w-10" />
              </TableRow></TableHeader>
              <TableBody>
                {inventory.filter((i) => [i.name, i.sku, i.category].some((f) => f?.toLowerCase().includes(s))).map((i) => (
                  <TableRow key={i.id} className="cursor-pointer" onClick={() => { setSelectedInv(i); setInvDialog(true); }}>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell className="text-muted-foreground">{i.sku || "—"}</TableCell>
                    <TableCell>{i.category || "—"}</TableCell>
                    <TableCell>{i.quantity} {i.unit}</TableCell>
                    <TableCell>{BRL(i.unit_cost)}</TableCell>
                    <TableCell>
                      {i.quantity <= i.min_quantity && i.min_quantity > 0 ? (
                        <div className="flex items-center gap-1 text-amber-600"><AlertTriangle className="h-4 w-4" /><span className="text-xs">Baixo</span></div>
                      ) : <span className="text-xs text-muted-foreground">OK</span>}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <ActionMenu onEdit={() => { setSelectedInv(i); setInvDialog(true); }} onDelete={() => setDeleteId({ type: "inventario", id: i.id })} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTable>
        </TabsContent>

        {/* Fragrâncias */}
        <TabsContent value="fragancias">
          <DataTable loading={fragLoading} empty={fragrances.length === 0} filtered={fragrances.filter((f) => [f.name, f.category, f.intensity].some((x) => x?.toLowerCase().includes(s))).length === 0 && fragrances.length > 0} icon={<Flower2 className="h-12 w-12" />} search={search} onAdd={handleNew}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead>Intensidade</TableHead><TableHead>Status</TableHead><TableHead className="w-10" />
              </TableRow></TableHeader>
              <TableBody>
                {fragrances.filter((f) => [f.name, f.category, f.intensity].some((x) => x?.toLowerCase().includes(s))).map((f) => (
                  <TableRow key={f.id} className="cursor-pointer" onClick={() => { setSelectedFrag(f); setFragDialog(true); }}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell><Badge variant="secondary">{f.category || "—"}</Badge></TableCell>
                    <TableCell>{f.intensity || "—"}</TableCell>
                    <TableCell><Badge variant={f.is_active ? "default" : "secondary"}>{f.is_active ? "Ativo" : "Inativo"}</Badge></TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <ActionMenu onEdit={() => { setSelectedFrag(f); setFragDialog(true); }} onDelete={() => setDeleteId({ type: "fragancias", id: f.id })} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTable>
        </TabsContent>

        {/* Visitas Técnicas */}
        <TabsContent value="visitas_tecnicas">
          <DataTable loading={tvLoading} empty={techVisits.length === 0} filtered={techVisits.filter((v) => [v.description, v.visit_type, v.status].some((x) => x?.toLowerCase().includes(s))).length === 0 && techVisits.length > 0} icon={<ClipboardCheck className="h-12 w-12" />} search={search} onAdd={handleNew}>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Status</TableHead><TableHead>Duração</TableHead><TableHead>Descrição</TableHead><TableHead>Próxima</TableHead><TableHead className="w-10" />
              </TableRow></TableHeader>
              <TableBody>
                {techVisits.filter((v) => [v.description, v.visit_type, v.status].some((x) => x?.toLowerCase().includes(s))).map((v) => (
                  <TableRow key={v.id} className="cursor-pointer" onClick={() => { setSelectedTv(v); setTvDialog(true); }}>
                    <TableCell className="font-medium">{new Date(v.visit_date + "T12:00:00").toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell><Badge variant="secondary">{v.visit_type}</Badge></TableCell>
                    <TableCell><Badge variant={v.status === "concluida" ? "default" : v.status === "cancelada" ? "destructive" : "secondary"}>{v.status}</Badge></TableCell>
                    <TableCell>{v.duration_minutes ? `${v.duration_minutes} min` : "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{v.description || "—"}</TableCell>
                    <TableCell>{v.next_visit_date ? new Date(v.next_visit_date + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <ActionMenu onEdit={() => { setSelectedTv(v); setTvDialog(true); }} onDelete={() => setDeleteId({ type: "visitas_tecnicas", id: v.id })} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTable>
        </TabsContent>
      </Tabs>

      <OperationFormDialog open={opDialog} onOpenChange={setOpDialog} operation={selectedOp} />
      <ScheduleFormDialog open={schDialog} onOpenChange={setSchDialog} schedule={selectedSch} />
      <InventoryFormDialog open={invDialog} onOpenChange={setInvDialog} item={selectedInv} />
      <EkkoaClientFormDialog open={ekCliDialog} onOpenChange={setEkCliDialog} client={selectedEkCli} />
      <EkkoaLeadFormDialog open={ekLeadDialog} onOpenChange={setEkLeadDialog} lead={selectedEkLead} />
      <EkkoaEquipmentFormDialog open={ekEquipDialog} onOpenChange={setEkEquipDialog} equipment={selectedEkEquip} />
      <EkkoaInstallationFormDialog open={ekInstallDialog} onOpenChange={setEkInstallDialog} installation={selectedEkInstall} />
      <EkkoaContractFormDialog open={ekContractDialog} onOpenChange={setEkContractDialog} contract={selectedEkContract} />
      <EkkoaBillingFormDialog open={ekBillingDialog} onOpenChange={setEkBillingDialog} billing={selectedEkBilling} />
      <EkkoaFragranceLineFormDialog open={fragDialog} onOpenChange={setFragDialog} fragrance={selectedFrag} />
      <EkkoaCoverageAreaFormDialog open={areaDialog} onOpenChange={setAreaDialog} area={selectedArea} />
      <EkkoaTechnicalVisitFormDialog open={tvDialog} onOpenChange={setTvDialog} visit={selectedTv} />

      <DeleteConfirmDialog open={!!deleteId} onCancel={() => setDeleteId(null)} onConfirm={handleDelete} />
    </AppLayout>
  );
}

function LoadingState() {
  return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
}

function EmptyState({ icon, msg, onAdd }: { icon: React.ReactNode; msg: string; onAdd?: () => void }) {
  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">
      <div className="text-center space-y-2">
        <div className="mx-auto text-muted-foreground/40 flex items-center justify-center">{icon}</div>
        <p>{msg}</p>
        {onAdd && <Button variant="outline" onClick={onAdd}>Adicionar primeiro</Button>}
      </div>
    </div>
  );
}

function DataTable({ loading, empty, filtered, icon, search, onAdd, children }: {
  loading: boolean; empty: boolean; filtered: boolean; icon: React.ReactNode; search: string; onAdd: () => void; children: React.ReactNode;
}) {
  if (loading) return <LoadingState />;
  if (empty) return <EmptyState icon={icon} msg="Nenhum registro cadastrado." onAdd={onAdd} />;
  if (filtered) return <EmptyState icon={icon} msg="Nenhum resultado encontrado." />;
  return <div className="rounded-lg border bg-card">{children}</div>;
}

function ActionMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}><Pencil className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4 mr-2" />Excluir</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DeleteConfirmDialog({ open, onCancel, onConfirm }: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={onCancel}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar exclusão?</AlertDialogTitle>
          <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
