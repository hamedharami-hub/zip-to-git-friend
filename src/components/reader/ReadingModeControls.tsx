/**
 * Convenience wrapper: mounts the ReadingModeSheet trigger (returns a
 * button) PLUS the three ambient controllers (bionic, focus, auto-scroll)
 * bound to a container selector, and the Eye-Comfort overlay.
 *
 * Use this once per reading page (news article / book chapter) inside the
 * header — the button appears in the toolbar, and the invisible
 * controllers manage the reading content by CSS selector.
 */
import { ReadingModeSheet } from './ReadingModeSheet';
import { BionicApplier } from './BionicApplier';
import { FocusOverlay } from './FocusOverlay';
import { AutoScrollController } from './AutoScrollController';
import { EyeComfortLayer } from './EyeComfortLayer';

interface Props {
  /** CSS selector for the reading container (e.g. '[data-reading-root]'). */
  containerSelector: string;
  /** Called by RSVP player to grab the plain text at click time. */
  getText: () => string;
}

export function ReadingModeControls({ containerSelector, getText }: Props) {
  return (
    <>
      <ReadingModeSheet getText={getText} />
      <BionicApplier containerSelector={containerSelector} />
      <FocusOverlay containerSelector={containerSelector} />
      <AutoScrollController containerSelector={containerSelector} />
      <EyeComfortLayer />
    </>
  );
}
