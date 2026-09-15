import { PhoneOff, Volume2 } from "lucide-react";
import { Button } from "@/components/ui-kit";

export function ActiveCallDialog({
  status,
  callTimerSeconds,
  isMuted,
  onMute,
  onEnd,
}: {
  status: string;
  callTimerSeconds: number;
  isMuted: boolean;
  onMute?: () => void;
  onEnd: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-[hsl(var(--primary))]">Call status</div>
          <h3 className="text-xl font-bold">{status}</h3>
        </div>
        <div className="font-mono-ui text-sm text-[hsl(var(--muted-foreground))]">
          {Math.floor(callTimerSeconds / 60).toString().padStart(2, "0")}:
          {(callTimerSeconds % 60).toString().padStart(2, "0")}
        </div>
      </div>
      <div className="mt-5 flex gap-3">
        <Button variant="secondary" onClick={onMute} className="gap-2">
          <Volume2 size={16} />
          {isMuted ? "Unmute" : "Mute"}
        </Button>
        <Button variant="danger" onClick={onEnd} className="gap-2">
          <PhoneOff size={16} />
          End Call
        </Button>
      </div>
    </div>
  );
}
