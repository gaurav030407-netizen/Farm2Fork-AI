import { Button } from "@/components/ui-kit";
import { ProfileAvatar } from "@/components/profile-ui";

export function IncomingCallDialog({
  farmerName,
  farmerPhotoUrl,
  orderRef,
  onAccept,
  onDecline,
}: {
  farmerName: string;
  farmerPhotoUrl?: string | null;
  orderRef: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
      <div className="mb-2 font-mono-ui text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">
        Incoming call
      </div>
      <div className="flex items-center gap-3"><ProfileAvatar src={farmerPhotoUrl} name={farmerName} size="size-10" /><h3 className="text-xl font-bold">Incoming call from a Farm2Fork buyer</h3></div>
      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
        {farmerName} · Order {orderRef}
      </p>
      <div className="mt-5 flex gap-3">
        <Button variant="primary" onClick={onAccept}>Accept</Button>
        <Button variant="secondary" onClick={onDecline}>Decline</Button>
      </div>
    </div>
  );
}
