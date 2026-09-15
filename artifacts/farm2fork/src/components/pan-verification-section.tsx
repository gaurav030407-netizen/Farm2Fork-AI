import { Info } from "lucide-react";
import { Button } from "@/components/ui-kit";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const explanation =
  "PAN verification is intended to help confirm your identity and improve trust and safety between Farm2Fork users. Actual PAN verification will be introduced in a future version.";

export function PanVerificationSection() {
  return (
    <section
      className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"
      aria-labelledby="pan-verification-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="pan-verification-title" className="font-bold">
              PAN Verification
            </h2>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-full p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
                  aria-label="About PAN verification"
                >
                  <Info size={15} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {explanation}
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="mt-2 max-w-xl text-sm text-[hsl(var(--muted-foreground))]">
            PAN verification helps Farm2Fork confirm a user&apos;s identity and
            creates greater trust between buyers and farmers.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--muted))] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
          <span className="size-2 rounded-full border border-current" /> Not
          Verified
        </span>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[hsl(var(--border))] pt-4">
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          PAN verification will be available in a future version of Farm2Fork.
        </p>
        <Button type="button" variant="secondary" disabled>
          Verification Coming Soon
        </Button>
      </div>
    </section>
  );
}
