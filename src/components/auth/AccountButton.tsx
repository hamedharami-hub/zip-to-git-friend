import { Link } from "react-router-dom";
import { Cloud, CloudOff, LogIn, LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export const AccountButton = () => {
  const { user, signOut, loading } = useAuth();

  if (loading) {
    return (
      <Button variant="ghost" size="sm" disabled aria-label="Loading account">
        <UserIcon className="h-4 w-4" />
      </Button>
    );
  }

  if (!user) {
    return (
      <Link to="/auth">
        <Button variant="outline" size="sm" aria-label="Sign in">
          <LogIn className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Sign in</span>
        </Button>
      </Link>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out. Cards remain on this device.");
  };

  const initials = (user.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Account menu" className="gap-2">
          <span
            className="h-7 w-7 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center"
            aria-hidden="true"
          >
            {initials}
          </span>
          <Cloud className="h-3.5 w-3.5 text-primary hidden sm:inline" aria-label="Synced" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-0.5">
          <p className="text-sm font-medium truncate">{user.email}</p>
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Cloud className="h-3 w-3" /> Leitner cards syncing
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const SyncBadge = () => {
  const { user } = useAuth();
  if (user) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-primary"
        aria-label="Cloud sync active"
      >
        <Cloud className="h-3.5 w-3.5" /> synced
      </span>
    );
  }
  return (
    <Link
      to="/auth"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <CloudOff className="h-3.5 w-3.5" /> local only
    </Link>
  );
};
