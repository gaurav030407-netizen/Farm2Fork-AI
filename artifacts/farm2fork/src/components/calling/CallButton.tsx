import { Phone } from "lucide-react";
import { Button } from "@/components/ui-kit";

export function CallButton({
  onClick,
  disabled,
  label = "Call Farmer",
}: {
  onClick?: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Button variant="secondary" onClick={onClick} disabled={disabled} className="gap-2">
      <Phone size={16} />
      {label}
    </Button>
  );
}
