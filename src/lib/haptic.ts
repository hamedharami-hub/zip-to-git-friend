/**
 * Lightweight haptic feedback helper.
 *
 * On the web it uses `navigator.vibrate` (Android / supported PWA runtimes).
 * Inside Capacitor it tries to use the native `Haptics` plugin for iOS/Android
 * taptic feedback, falling back to vibration if the plugin is not linked.
 */

export type HapticPattern =
  | "tap"
  | "press"
  | "selection"
  | "light"
  | "medium"
  | "heavy"
  | "success"
  | "error"
  | "warning";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 8,
  selection: 5,
  light: 6,
  medium: 14,
  press: 18,
  heavy: 24,
  success: [10, 45, 10],
  error: [30, 45, 30, 45, 30],
  warning: [20, 55, 20],
};

/** Is any form of vibration/haptic supported on this device? */
export function isHapticSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof navigator !== "undefined" && "vibrate" in navigator) return true;
  // Native Capacitor haptic check happens lazily in `haptic()`.
  return isCapacitor();
}

function isCapacitor(): boolean {
  try {
    const cap = (window as typeof window & { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor;
    return cap?.isNativePlatform?.() ?? false;
  } catch {
    return false;
  }
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined") return;
  try {
    if ("vibrate" in navigator && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* ignore */
  }
}

async function tryNativeHaptic(pattern: HapticPattern) {
  try {
    const mod = await import("@capacitor/haptics");
    const Haptics = mod.Haptics;
    const ImpactStyle = mod.ImpactStyle;
    const NotificationType = mod.NotificationType;

    if (pattern === "success" || pattern === "error" || pattern === "warning") {
      const type =
        pattern === "success"
          ? NotificationType.SUCCESS
          : pattern === "error"
            ? NotificationType.ERROR
            : NotificationType.WARNING;
      await Haptics.notification({ type });
    } else {
      const style =
        pattern === "heavy"
          ? ImpactStyle.Heavy
          : pattern === "medium" || pattern === "press"
            ? ImpactStyle.Medium
            : ImpactStyle.Light;
      await Haptics.impact({ style });
    }
  } catch {
    /* plugin not installed or not native — fallback is already done */
  }
}

/**
 * Trigger a haptic pattern.
 *
 * The call is fire-and-forget; it will not throw if the device does not
 * support haptics.
 */
export function haptic(pattern: HapticPattern = "tap") {
  if (typeof window === "undefined") return;

  const patternValue = PATTERNS[pattern];
  if (patternValue === undefined) return;

  // Always try web vibration first (synchronous, no native bridge needed).
  vibrate(patternValue);

  // If we are in Capacitor, also try native Haptics for crisp taptic feedback.
  if (isCapacitor()) {
    void tryNativeHaptic(pattern);
  }
}
