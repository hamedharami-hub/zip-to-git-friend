/**
 * Two-button EN/FA segmented toggle for the chapter TTS player.
 * Extracted from ChapterTTSPlayer.
 */

interface Props {
  value: "en" | "fa";
  onChange: (v: "en" | "fa") => void;
}

export function LangToggle({ value, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="زبان"
      className="inline-flex rounded-md border border-border bg-muted/40 p-0.5"
    >
      {(["en", "fa"] as const).map((l) => (
        <button
          key={l}
          type="button"
          role="tab"
          aria-selected={value === l}
          onClick={() => onChange(l)}
          className={
            "px-2 py-0.5 text-[11px] font-medium rounded " +
            (value === l ? "bg-background shadow-sm" : "text-muted-foreground")
          }
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
