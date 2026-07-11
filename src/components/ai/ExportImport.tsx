import { useRef } from "react";
import { Download, Upload, FileDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { exportBundleToFile, exportTrackSRT, importBundleFromFile } from "@/lib/srtExporter";
import { useSubtitleStore } from "@/store/subtitleStore";
import { useVideoStore } from "@/store/videoStore";
import { toast } from "sonner";

interface Props {
  videoId: string;
  onImported?: () => void;
}

export function ExportImport({ videoId, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const primary = useSubtitleStore((s) => s.primary);
  const secondary = useSubtitleStore((s) => s.secondary);
  const current = useVideoStore((s) => s.current);
  const baseName = (current?.title || "subtitles").replace(/[^\w\-]+/g, "_");

  const handleImport = async (file: File) => {
    try {
      const result = await importBundleFromFile(file);
      toast.success(
        `Imported ${result.videos} video(s), ${result.tracks} track(s), ${result.analyses} analyses.`,
      );
      onImported?.();
    } catch (e) {
      console.error(e);
      toast.error("Import failed: invalid file.");
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImport(f);
          e.target.value = "";
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            <FileDown className="h-4 w-4 mr-1.5" />
            Export / Import
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Export</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => exportBundleToFile(videoId, `${baseName}-bundle`)}>
            <Download className="h-4 w-4 mr-2" /> Bundle (.json)
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!primary}
            onClick={() => primary && exportTrackSRT(primary, baseName)}
          >
            <Download className="h-4 w-4 mr-2" /> Primary SRT
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!secondary}
            onClick={() => secondary && exportTrackSRT(secondary, baseName)}
          >
            <Download className="h-4 w-4 mr-2" /> Secondary SRT
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Import</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" /> Bundle (.json)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
