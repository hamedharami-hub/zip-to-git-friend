import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, LogIn } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePageMeta } from '@/hooks/usePageMeta';
import { toast } from 'sonner';

const safePath = (value: string | null | undefined) => {
  if (!value) return '/';
  return value.startsWith('/') && !value.startsWith('//') ? value : '/';
};

const readStoredNextPath = () => {
  try {
    return safePath(window.localStorage.getItem('llp-post-auth-path'));
  } catch {
    return '/';
  }
};

const cleanupStoredNextPath = () => {
  try {
    window.localStorage.removeItem('llp-post-auth-path');
  } catch {
    // Ignore storage failures.
  }
};

export default function AuthCallback() {
  usePageMeta({
    title: 'Completing sign in — Language Learning Player',
    description: 'در حال تکمیل ورود امن به حساب کاربری.',
  });
  const navigate = useNavigate();
  const [message, setMessage] = useState('در حال تکمیل ورود با گوگل…');

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const url = new URL(window.location.href);
    const nextPath = safePath(url.searchParams.get('next') || readStoredNextPath());

    const finish = () => {
      if (cancelled) return;
      cleanupStoredNextPath();
      navigate(nextPath, { replace: true });
    };

    const fail = (error: unknown) => {
      if (cancelled) return;
      const msg = error instanceof Error ? error.message : 'Google sign-in failed.';
      setMessage('ورود کامل نشد. دوباره تلاش کن.');
      toast.error(msg);
      timeoutId = setTimeout(() => navigate('/auth', { replace: true }), 1600);
    };

    const complete = async () => {
      try {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const accessToken = hash.get('access_token') || url.searchParams.get('access_token');
        const refreshToken = hash.get('refresh_token') || url.searchParams.get('refresh_token');
        const code = url.searchParams.get('code');
        const errorDescription =
          hash.get('error_description') ||
          url.searchParams.get('error_description') ||
          hash.get('error') ||
          url.searchParams.get('error');

        if (errorDescription) throw new Error(errorDescription);

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (data.session) {
          finish();
          return;
        }

        setMessage('منتظر ثبت نشست ورود…');
        timeoutId = setTimeout(async () => {
          const { data: retry } = await supabase.auth.getSession();
          if (retry.session) finish();
          else fail(new Error('No sign-in session was received from Google.'));
        }, 2500);
      } catch (error) {
        fail(error);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish();
    });

    void complete();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6" dir="rtl">
      <main className="w-full max-w-sm text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-full border border-border flex items-center justify-center">
          <LogIn className="h-5 w-5 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">تکمیل ورود</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        <Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" />
      </main>
    </div>
  );
}