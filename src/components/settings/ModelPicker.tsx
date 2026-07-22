import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ModelOption } from "@/lib/aiModels";

interface ModelPickerProps {
  label: string;
  value: string;
  options: ModelOption[];
  onChange: (v: string) => void;
  hint?: string;
}

export function ModelPicker({ label, value, options, onChange, hint }: ModelPickerProps) {
  // Group by provider prefix for readability.
  const groups = options.reduce<Record<string, ModelOption[]>>((acc, o) => {
    const prefix = o.value.includes(":") ? o.value.split(":")[0] : "Other";
    (acc[prefix] ??= []).push(o);
    return acc;
  }, {});

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(groups).map(([group, items]) => (
            <SelectGroup key={group}>
              <SelectLabel className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group === "gemini" ? "Gemini" : group === "groq" ? "Groq" : group}
              </SelectLabel>
              {items.map((o) => (
                <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                  <span className="flex flex-col">
                    <span>{o.label}</span>
                    {(o.hint || o.disabledReason) && (
                      <span
                        className={`text-xs ${o.disabled ? "text-destructive/70" : "text-muted-foreground"}`}
                      >
                        {o.disabled ? o.disabledReason : o.hint}
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
