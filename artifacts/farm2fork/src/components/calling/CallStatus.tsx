export function CallStatus({ status }: { status: string }) {
  const label = status === "creating" ? "Starting call..." : status === "ringing" ? "Calling farmer..." : status === "incoming" ? "Incoming call" : status === "connecting" ? "Connecting..." : status === "active" ? "Connected" : status === "declined" ? "Call declined" : status === "failed" ? "Call failed" : status === "ended" ? "Call ended" : status === "expired" ? "Call expired" : "Call status";
  return <div className="text-sm font-medium text-[hsl(var(--muted-foreground))]">{label}</div>;
}
