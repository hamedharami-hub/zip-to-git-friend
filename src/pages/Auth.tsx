import { usePageMeta } from '@/hooks/usePageMeta';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, LogIn, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const Auth = () => {
  usePageMeta({ title: 'Sign in — Language Learning Player', description: 'ورود / ثبت‌نام — دسترسی به پروفایل و همگام‌سازی ابری.' });
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get('next') ?? '';
  // Only accept same-origin relative paths for the post-auth redirect.
  const nextPath = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate(nextPath, { replace: true });
  }, [user, loading, navigate, nextPath]);

  const rememberPostAuthPath = () => {
    try {
      window.localStorage.setItem('llp-post-auth-path', nextPath);
    } catch {
      // Ignore storage failures; the callback will fall back to home.
    }
  };

  const authCallbackUrl = () => `${window.location.origin}/auth/callback`;

  const isInIframe = () => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  };

  const randomState = () => {
    if (window.crypto?.getRandomValues) {
      return Array.from(window.crypto.getRandomValues(new Uint8Array(16)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  };

  const handleEmail = async (mode: 'signin' | 'signup') => {
    if (!email || !password) {
      toast.error('Email and password are required.');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}${nextPath}` },
        });
        if (error) throw error;
        toast.success('Account created. Check your email to confirm (if required).');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Signed in.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Authentication failed.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setSubmitting(true);
    try {
      // On mobile browsers, the popup flow often gets blocked or auto-closed,
      // producing "Sign in was cancelled". Force a top-level redirect there.
      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      rememberPostAuthPath();

      if (isMobile && isInIframe()) {
        const params = new URLSearchParams({
          provider: 'google',
          redirect_uri: authCallbackUrl(),
          state: randomState(),
          prompt: 'select_account',
          display: 'page',
        });
        const redirectTo = `${window.location.origin}/~oauth/initiate?${params.toString()}`;
        try {
          window.top?.location.assign(redirectTo);
        } catch {
          window.location.assign(redirectTo);
        }
        return;
      }

      const extraParams: Record<string, string> = { prompt: 'select_account' };
      if (isMobile) extraParams.display = 'page';

      const result = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: authCallbackUrl(),
        extraParams,
      });
      if (result.error) {
        const msg = (result.error instanceof Error ? result.error.message : String(result.error)) || '';
        // Silently ignore popup-close cancellations — user just closed it.
        if (/cancel|closed|popup/i.test(msg)) {
          setSubmitting(false);
          return;
        }
        throw result.error;
      }
      if (result.redirected) return; // browser will redirect
      try {
        window.localStorage.removeItem('llp-post-auth-path');
      } catch {
        // Ignore storage failures.
      }
      navigate(nextPath, { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Google sign-in failed.';
      if (!/cancel|closed|popup/i.test(msg)) toast.error(msg);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-md mx-auto px-6 py-3 flex items-center justify-between">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" /> Home
            </Button>
          </Link>
          <h1 className="text-base font-medium flex items-center gap-2">
            <LogIn className="h-4 w-4 text-primary" /> Account
          </h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 py-10 space-y-6">
        <div className="space-y-1.5 text-center">
          <h2 className="text-2xl font-semibold">Sync your Leitner cards</h2>
          <p className="text-sm text-muted-foreground">
            Sign in so your saved words travel with you across devices and future apps.
          </p>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={handleGoogle}
          disabled={submitting}
        >
          <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M12 10.2v3.96h5.52c-.24 1.44-1.68 4.2-5.52 4.2-3.32 0-6.04-2.76-6.04-6.16s2.72-6.16 6.04-6.16c1.88 0 3.16.8 3.88 1.48l2.64-2.56C16.84 3.32 14.64 2.4 12 2.4 6.72 2.4 2.4 6.68 2.4 12s4.32 9.6 9.6 9.6c5.52 0 9.2-3.88 9.2-9.36 0-.64-.08-1.12-.16-1.6L12 10.2z"
            />
          </svg>
          Continue with Google
        </Button>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or with email</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Create account</TabsTrigger>
          </TabsList>

          {(['signin', 'signup'] as const).map((mode) => (
            <TabsContent key={mode} value={mode} className="space-y-3 mt-4">
              <div className="space-y-1.5">
                <Label htmlFor={`${mode}-email`}>Email</Label>
                <Input
                  id={`${mode}-email`}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${mode}-password`}>Password</Label>
                <Input
                  id={`${mode}-password`}
                  type="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => handleEmail(mode)}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Mail className="h-4 w-4 mr-2" />
                )}
                {mode === 'signup' ? 'Create account' : 'Sign in'}
              </Button>
            </TabsContent>
          ))}
        </Tabs>

        <p className="text-xs text-muted-foreground text-center">
          Your data is encrypted and only you can access your saved words.
        </p>
      </main>
    </div>
  );
};

export default Auth;
