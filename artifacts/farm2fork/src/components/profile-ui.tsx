import { Check, UserRound } from "lucide-react";
import { Badge } from "@/components/ui-kit";

export function ProfileAvatar({
  src,
  name,
  size = "size-24",
}: {
  src?: string | null;
  name: string;
  size?: string;
}) {
  return src ? (
    <img src={src} alt={name} className={`${size} rounded-full object-cover`} />
  ) : (
    <div
      className={`${size} flex items-center justify-center rounded-full bg-[hsl(var(--accent))] text-[hsl(var(--primary))]`}
    >
      <UserRound size={32} />
    </div>
  );
}

export function VerificationBadges({
  emailVerified,
  phoneVerified = false,
}: {
  emailVerified: boolean;
  phoneVerified?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {emailVerified && (
        <Badge tone="green">
          <Check size={12} /> Email verified
        </Badge>
      )}
      {phoneVerified && <Badge tone="green"><Check size={12} /> Mobile verified</Badge>}
    </div>
  );
}

export function ProfileCompletion({ percent }: { percent: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs font-semibold">
        <span>Profile completion</span>
        <span>{percent}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
        <div
          className="h-full rounded-full bg-[hsl(var(--primary))]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
