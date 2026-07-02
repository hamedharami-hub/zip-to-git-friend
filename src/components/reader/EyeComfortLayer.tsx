/**
 * Eye-comfort layer. Applies a preset (typography + warm color overlay)
 * to the entire page via CSS variables + a fixed overlay div. Cheap and
 * removable.
 */
import { useEffect } from 'react';
import { useReadingMode } from '@/hooks/useReadingMode';

export function EyeComfortLayer() {
  const { eyeComfortPreset, blueLightFilter, extraLineHeight } = useReadingMode();

  useEffect(() => {
    const root = document.documentElement;
    // Reset any prior classes
    root.classList.remove('rm-comfort', 'rm-sepia', 'rm-night', 'rm-contrast');
    if (eyeComfortPreset === 'comfort') root.classList.add('rm-comfort');
    else if (eyeComfortPreset === 'sepia') root.classList.add('rm-sepia');
    else if (eyeComfortPreset === 'night') root.classList.add('rm-night');
    else if (eyeComfortPreset === 'contrast') root.classList.add('rm-contrast');
    root.style.setProperty('--rm-extra-line-height', String(extraLineHeight));
  }, [eyeComfortPreset, extraLineHeight]);

  if (blueLightFilter <= 0) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[9998]"
      style={{
        background: '#ffb066',
        mixBlendMode: 'multiply',
        opacity: Math.min(0.4, blueLightFilter),
      }}
    />
  );
}
