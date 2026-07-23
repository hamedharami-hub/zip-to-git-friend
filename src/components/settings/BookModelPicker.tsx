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
import { bookRefToValue, bookValueToRef, type BookModelOption } from "@/lib/aiModels";
import type { BookAIModelRef } from "@/types";

interface BookModelPickerProps {
  label: string;
  hint?: string;
  value: BookAIModelRef;
  onChange: (ref: BookAIModelRef) => void;
  options: BookModelOption[];
}

export function BookModelPicker({ label, hint, value, onChange, options }: BookModelPickerProps) {
  const currentValue = bookRefToValue(value);
  const groups = options.reduce<Record<string, BookModelOption[]>>((acc, o) => {
    (acc[o.group] ??= []).push(o);
    return acc;
  }, {});
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={currentValue} onValueChange={(v) => onChange(bookValueToRef(v))}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(groups).map(([group, items]) => (
            <SelectGroup key={group}>
              <SelectLabel className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group}
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
