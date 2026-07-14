import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2 } from "lucide-react";

interface ApiKeyInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onTest?: () => void;
  testing?: boolean;
}

export function ApiKeyInput({
  label,
  value,
  onChange,
  placeholder,
  onTest,
  testing,
}: ApiKeyInputProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="pr-10"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide" : "Show"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        {onTest && (
          <Button type="button" variant="outline" onClick={onTest} disabled={testing || !value}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
          </Button>
        )}
      </div>
    </div>
  );
}
