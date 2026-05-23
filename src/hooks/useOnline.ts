import { useEffect, useState } from 'react';
import { toast } from 'sonner';

/**
 * Tracks navigator.onLine and toasts on transitions. Returns current online state.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    let mounted = true;
    const handleOnline = () => {
      if (!mounted) return;
      setOnline(true);
      toast.success('Back online — AI features re-enabled.');
    };
    const handleOffline = () => {
      if (!mounted) return;
      setOnline(false);
      toast.warning('You are offline. Video playback and Leitner still work.');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      mounted = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return online;
}
