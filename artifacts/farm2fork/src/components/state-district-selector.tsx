import React from "react";
import { INDIAN_STATES, getDistrictsForState } from "@/lib/indian-locations";

type StateDistrictSelectorProps = {
  selectedState: string;
  selectedDistrict: string;
  onStateChange: (state: string) => void;
  onDistrictChange: (district: string) => void;
  stateLabel?: string;
  districtLabel?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  stateTestId?: string;
  districtTestId?: string;
};

export function StateDistrictSelector({
  selectedState,
  selectedDistrict,
  onStateChange,
  onDistrictChange,
  stateLabel = "State / Union Territory",
  districtLabel = "District",
  disabled = false,
  className = "",
  required = false,
  stateTestId = "select-state",
  districtTestId = "select-district",
}: StateDistrictSelectorProps) {
  const districts = React.useMemo(() => {
    return getDistrictsForState(selectedState);
  }, [selectedState]);

  const handleStateSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newState = e.target.value;
    onStateChange(newState);
    // Reset district whenever state changes
    onDistrictChange("");
  };

  const handleDistrictSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onDistrictChange(e.target.value);
  };

  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${className}`}>
      {/* State Selection */}
      <label className="block text-sm font-semibold">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          {stateLabel} {required && <span className="text-red-500">*</span>}
        </span>
        <select
          value={selectedState}
          onChange={handleStateSelect}
          disabled={disabled}
          required={required}
          data-testid={stateTestId}
          className="min-h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))] outline-none transition focus:border-[hsl(var(--primary))] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">-- Select State / UT (36) --</option>
          {INDIAN_STATES.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>
      </label>

      {/* District Selection */}
      <label className="block text-sm font-semibold">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          {districtLabel} {required && <span className="text-red-500">*</span>}
        </span>
        <select
          value={selectedDistrict}
          onChange={handleDistrictSelect}
          disabled={disabled || !selectedState}
          required={required}
          data-testid={districtTestId}
          className="min-h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))] outline-none transition focus:border-[hsl(var(--primary))] disabled:cursor-not-allowed disabled:bg-[hsl(var(--muted)/.4)] disabled:opacity-60"
        >
          <option value="">
            {!selectedState
              ? "← Select a state first"
              : districts.length === 0
              ? "-- No districts found --"
              : `-- Select District (${districts.length}) --`}
          </option>
          {districts.map((district) => (
            <option key={district} value={district}>
              {district}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
