import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Cloud,
  CloudDownload,
  CloudUpload,
  Loader2,
  LogIn,
  LogOut,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { toast } from "sonner";
import { usePageMeta } from "@/hooks/usePageMeta";

export default function FirebaseAuthPage() {
  const { user, loading, ready, signIn, signUp, signOut, syncSettingsUp, syncSettingsDown } =
    useFirebaseAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  usePageMeta({
    title: "Firebase account — Lingua",
    description: "Sign in / sign up and cloud-sync settings with Firebase.",
  });

  const guard = async (fn: () => Promise<void>, okMsg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(okMsg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  const handleSignUp = () => {
    if (!email || !password) return toast.error("Email and password are required");
    return guard(() => signUp(email, password, displayName || undefined), "Account created");
  };
  const handleSignIn = () => {
    if (!email || !password) return toast.error("Email and password are required");
    return guard(() => signIn(email, password), "Signed in");
  };

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <header className="border-b border-border">
        <div className="max-w-md mx-auto px-6 py-3 flex items-center justify-between">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 ml-2" />
              Home
            </Button>
          </Link>
          <h1 className="text-base font-medium flex items-center gap-2">
            <Cloud className="h-4 w-4 text-primary" /> Firebase account
          </h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 py-8 space-y-6">
        {!ready && (
          <div className="text-sm text-muted-foreground text-center">
            <Loader2 className="inline h-4 w-4 animate-spin ml-2" /> Preparing Firebase…
          </div>
        )}

        {ready && !loading && user && (
          <section className="space-y-4 rounded-lg border border-border p-5">
            <div>
              <p className="text-sm text-muted-foreground">Signed in as</p>
              <p className="font-medium">{user.displayName || user.email}</p>
              <p className="text-xs text-muted-foreground mt-1">UID: {user.uid}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => guard(syncSettingsUp, "Settings uploaded")}
                disabled={busy}
              >
                <CloudUpload className="h-4 w-4 ml-2" /> Upload settings
              </Button>
              <Button
                variant="outline"
                onClick={() => guard(syncSettingsDown, "Settings downloaded")}
                disabled={busy}
              >
                <CloudDownload className="h-4 w-4 ml-2" /> Download settings
              </Button>
            </div>
            <Button
              variant="destructive"
              className="w-full"
              onClick={() =>
                guard(async () => {
                  await signOut();
                  navigate("/firebase-auth", { replace: true });
                }, "Signed out")
              }
              disabled={busy}
            >
              <LogOut className="h-4 w-4 ml-2" /> Sign out
            </Button>
            <p className="text-xs text-muted-foreground">
              Settings are saved to the cloud automatically while you are signed in.
            </p>
          </section>
        )}

        {ready && !loading && !user && (
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="space-y-3 mt-4">
              <div className="space-y-1.5">
                <Label htmlFor="si-email">Email</Label>
                <Input
                  id="si-email"
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="si-pass">Password</Label>
                <Input
                  id="si-pass"
                  type="password"
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button className="w-full" onClick={handleSignIn} disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                ) : (
                  <LogIn className="h-4 w-4 ml-2" />
                )}{" "}
                Sign in
              </Button>
            </TabsContent>

            <TabsContent value="signup" className="space-y-3 mt-4">
              <div className="space-y-1.5">
                <Label htmlFor="su-name">Display name</Label>
                <Input
                  id="su-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="su-email">Email</Label>
                <Input
                  id="su-email"
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="su-pass">Password (at least 6 characters)</Label>
                <Input
                  id="su-pass"
                  type="password"
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button className="w-full" onClick={handleSignUp} disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                ) : (
                  <UserPlus className="h-4 w-4 ml-2" />
                )}{" "}
                Sign up
              </Button>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
