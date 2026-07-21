import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Tracks navigator.onLine and toasts on transitions. Returns current online state.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    let mounted = true;
    const handleOnline = () => {
      if (!mounted) return;
      setOnline(true);
      toast.success("اتصال اینترنت برگشت — امکانات AI فعال شد.");
    };
    const handleOffline = () => {
      if (!mounted) return;
      setOnline(false);
      toast.warning("شما آفلاین هستید. ویدیوهای ذخیره‌شده و Leitner همچنان کار می‌کنند.");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      mounted = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
