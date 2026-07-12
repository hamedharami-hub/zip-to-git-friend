import { useCallback } from "react";
import { haptic, type HapticPattern } from "@/lib/haptic";

/**
 * Hook to trigger haptic feedback.
 *
 * Usage:
 *   const { tap } = useHaptic();
 *   <button onClick={tap} />
 */
export function useHaptic() {
  const trigger = useCallback((pattern: HapticPattern = "tap") => {
    haptic(pattern);
  }, []);

  return {
    tap: useCallback(() => haptic("tap"), []),
    press: useCallback(() => haptic("press"), []),
    selection: useCallback(() => haptic("selection"), []),
    light: useCallback(() => haptic("light"), []),
    medium: useCallback(() => haptic("medium"), []),
    heavy: useCallback(() => haptic("heavy"), []),
    success: useCallback(() => haptic("success"), []),
    error: useCallback(() => haptic("error"), []),
    warning: useCallback(() => haptic("warning"), []),
    haptic: trigger,
  };
}
