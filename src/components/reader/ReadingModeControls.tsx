/**
 * Convenience wrapper: mounts the ReadingModeSheet trigger PLUS the three
 * ambient controllers (bionic, focus, auto-scroll) bound to a container
 * selector, and the Eye-Comfort overlay.
 */
import { ReadingModeSheet } from './ReadingModeSheet';
import { BionicApplier } from './BionicApplier';
import { FocusOverlay } from './FocusOverlay';
import { AutoScrollController } from './AutoScrollController';
import { EyeComfortLayer } from './EyeComfortLayer';

interface Props {
  containerSelector: string;
  /** Kept for API compat; no longer used (Flash mode removed). */
  getText?: () => string;
}

export function ReadingModeControls({ containerSelector }: Props) {
  return (
    <>
      <ReadingModeSheet />
      <BionicApplier containerSelector={containerSelector} />
      <FocusOverlay containerSelector={containerSelector} />
      <AutoScrollController containerSelector={containerSelector} />
      <EyeComfortLayer />
    </>
  );
}
