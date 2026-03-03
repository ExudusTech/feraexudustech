import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Camera, Navigation, Loader2, CheckCircle } from "lucide-react";
import { useCompleteVisit } from "@/hooks/use-ekkoa-workflow";
import { useEkkoaEquipment } from "@/hooks/use-ekkoa-equipment";
import { useEkkoaFragranceLines } from "@/hooks/use-ekkoa-fragrance-lines";
import { supabase } from "@/integrations/supabase/client";
import type { Schedule } from "@/hooks/use-schedules";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: Schedule | null;
}

export default function StartVisitDialog({ open, onOpenChange, schedule }: Props) {
  const [installLocation, setInstallLocation] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [fragranceLineId, setFragranceLineId] = useState("");
  const [realSerialNumber, setRealSerialNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const completeVisit = useCompleteVisit();
  const { data: equipment = [] } = useEkkoaEquipment();
  const { data: fragrances = [] } = useEkkoaFragranceLines();

  useEffect(() => {
    if (!open) {
      setInstallLocation("");
      setEquipmentId("");
      setFragranceLineId("");
      setRealSerialNumber("");
      setNotes("");
      setLatitude(undefined);
      setLongitude(undefined);
      setGpsError("");
      setPhotoFile(null);
      setPhotoPreview(null);
    }
  }, [open]);

  const captureGPS = () => {
    if (!navigator.geolocation) {
      setGpsError("GPS não disponível neste dispositivo");
      return;
    }
    setGpsLoading(true);
    setGpsError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setGpsLoading(false);
      },
      (err) => {
        setGpsError("Não foi possível obter localização. Verifique as permissões.");
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleComplete = async () => {
    if (!schedule) return;

    let photoUrl: string | undefined;

    // Upload photo if selected
    if (photoFile) {
      setUploading(true);
      const ext = photoFile.name.split(".").pop();
      const path = `visits/${schedule.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("visit-photos")
        .upload(path, photoFile);

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from("visit-photos").getPublicUrl(path);
        photoUrl = urlData.publicUrl;
      }
      setUploading(false);
    }

    await completeVisit.mutateAsync({
      scheduleId: schedule.id,
      operationId: schedule.operation_id,
      equipmentId: equipmentId || undefined,
      fragranceLineId: fragranceLineId || undefined,
      realSerialNumber: realSerialNumber || undefined,
      installLocation: installLocation || undefined,
      latitude,
      longitude,
      photoUrl,
      notes: notes || undefined,
    });

    onOpenChange(false);
  };

  const isPending = completeVisit.isPending || uploading;
  const availableEquipment = equipment.filter((e) => e.status === "disponivel");
  const activeFragrances = fragrances.filter((f) => f.is_active);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Iniciar Visita</DialogTitle>
        </DialogHeader>

        {schedule && (
          <Card className="bg-muted/30">
            <CardContent className="pt-3 pb-2 space-y-1">
              <p className="font-medium text-sm">{schedule.title}</p>
              {schedule.location && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />{schedule.location}
                </p>
              )}
              {schedule.scheduled_date && (
                <p className="text-xs text-muted-foreground">
                  Data: {new Date(schedule.scheduled_date + "T12:00:00").toLocaleDateString("pt-BR")}
                  {schedule.start_time && ` às ${schedule.start_time.slice(0, 5)}`}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {/* Local da instalação */}
          <div>
            <Label>Local da instalação no cliente</Label>
            <Input
              value={installLocation}
              onChange={(e) => setInstallLocation(e.target.value)}
              placeholder="Ex: Recepção, Sala de Reuniões, Banheiro Social..."
            />
          </div>

          {/* Equipamento */}
          <div>
            <Label>Tipo de aparelho</Label>
            <Select value={equipmentId} onValueChange={setEquipmentId}>
              <SelectTrigger><SelectValue placeholder="Selecione o equipamento..." /></SelectTrigger>
              <SelectContent>
                {availableEquipment.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name} {e.model ? `- ${e.model}` : ""} {e.brand ? `(${e.brand})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fragrância */}
          <div>
            <Label>Fragrância</Label>
            <Select value={fragranceLineId} onValueChange={setFragranceLineId}>
              <SelectTrigger><SelectValue placeholder="Selecione a fragrância..." /></SelectTrigger>
              <SelectContent>
                {activeFragrances.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name} {f.category ? `(${f.category})` : ""} {f.intensity ? `— ${f.intensity}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Número de série real */}
          <div>
            <Label>Nº de série do aparelho</Label>
            <Input
              value={realSerialNumber}
              onChange={(e) => setRealSerialNumber(e.target.value)}
              placeholder="Número de série real do equipamento"
            />
          </div>

          {/* GPS */}
          <div>
            <Label>Geolocalização</Label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={captureGPS} disabled={gpsLoading}>
                {gpsLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Navigation className="h-4 w-4 mr-1" />}
                {latitude ? "Atualizar GPS" : "Capturar GPS"}
              </Button>
              {latitude && longitude && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-emerald-500" />
                  {latitude.toFixed(6)}, {longitude.toFixed(6)}
                </span>
              )}
            </div>
            {gpsError && <p className="text-xs text-destructive mt-1">{gpsError}</p>}
          </div>

          {/* Foto */}
          <div>
            <Label>Foto da instalação</Label>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer">
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-md border text-sm hover:bg-accent transition-colors">
                  <Camera className="h-4 w-4" />
                  {photoFile ? "Trocar foto" : "Tirar foto"}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </label>
              {photoFile && <span className="text-xs text-muted-foreground">{photoFile.name}</span>}
            </div>
            {photoPreview && (
              <img src={photoPreview} alt="Preview" className="mt-2 rounded-lg max-h-40 object-cover" />
            )}
          </div>

          {/* Observações */}
          <div>
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anotações sobre a visita..." />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleComplete} disabled={isPending}>
            {isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-1" />Salvando...</>
            ) : (
              <><CheckCircle className="h-4 w-4 mr-1" />Concluir Instalação</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
