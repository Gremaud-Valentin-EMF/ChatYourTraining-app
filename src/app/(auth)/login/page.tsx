"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";
import { Mail, Lock } from "lucide-react";

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

interface AttemptRecord {
  count: number;
  lockedUntil: number | null;
}

function getAttemptRecord(email: string): AttemptRecord {
  try {
    const raw = localStorage.getItem(`login_attempts_${email}`);
    if (!raw) return { count: 0, lockedUntil: null };
    return JSON.parse(raw) as AttemptRecord;
  } catch {
    return { count: 0, lockedUntil: null };
  }
}

function saveAttemptRecord(email: string, record: AttemptRecord) {
  localStorage.setItem(`login_attempts_${email}`, JSON.stringify(record));
}

function clearAttemptRecord(email: string) {
  localStorage.removeItem(`login_attempts_${email}`);
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes} min ${seconds > 0 ? `${seconds} s` : ""}`.trim();
  return `${seconds} s`;
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lockRemaining, setLockRemaining] = useState<number>(0);

  // Tick countdown when account is locked
  useEffect(() => {
    if (lockRemaining <= 0) return;
    const interval = setInterval(() => {
      setLockRemaining((prev) => {
        const next = prev - 1000;
        if (next <= 0) {
          clearInterval(interval);
          setError(null);
          return 0;
        }
        setError(`Compte temporairement bloqué. Réessayez dans ${formatRemaining(next)}.`);
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockRemaining]);

  // Check lock state whenever email changes
  useEffect(() => {
    if (!email) return;
    const record = getAttemptRecord(email);
    if (record.lockedUntil && record.lockedUntil > Date.now()) {
      const remaining = record.lockedUntil - Date.now();
      setLockRemaining(remaining);
      setError(`Compte temporairement bloqué. Réessayez dans ${formatRemaining(remaining)}.`);
    } else {
      setLockRemaining(0);
    }
  }, [email]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Check if currently locked
    const record = getAttemptRecord(email);
    if (record.lockedUntil && record.lockedUntil > Date.now()) {
      const remaining = record.lockedUntil - Date.now();
      setLockRemaining(remaining);
      setError(`Compte temporairement bloqué. Réessayez dans ${formatRemaining(remaining)}.`);
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        const updated: AttemptRecord = {
          count: record.count + 1,
          lockedUntil: record.count + 1 >= MAX_ATTEMPTS
            ? Date.now() + LOCK_DURATION_MS
            : null,
        };
        saveAttemptRecord(email, updated);

        if (updated.lockedUntil) {
          const remaining = updated.lockedUntil - Date.now();
          setLockRemaining(remaining);
          setError(`Compte temporairement bloqué. Réessayez dans ${formatRemaining(remaining)}.`);
        } else {
          setError("E-mail ou mot de passe incorrect.");
        }
        return;
      }

      clearAttemptRecord(email);
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsLoading(false);
    }
  };

  const isLocked = lockRemaining > 0;

  return (
    <div className="max-w-md mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Content de vous revoir !
        </h2>
        <p className="text-muted">
          Connectez-vous pour accéder à votre tableau de bord
        </p>
      </div>

      <form onSubmit={handleEmailLogin} className="space-y-4">
        <Input
          label="Email"
          type="email"
          placeholder="Votre email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          leftIcon={<Mail className="h-5 w-5" />}
          required
          autoComplete="email"
        />

        <Input
          label="Mot de passe"
          type="password"
          placeholder="Votre mot de passe"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null); }}
          leftIcon={<Lock className="h-5 w-5" />}
          required
          autoComplete="current-password"
        />

        {error && (
          <div className="p-3 bg-error/10 border border-error/20 rounded-xl text-error text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end">
          <Link
            href="/forgot-password"
            className="text-sm text-accent hover:text-accent-400 transition-[color]"
          >
            Mot de passe oublié ?
          </Link>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          isLoading={isLoading}
          disabled={isLocked || isLoading}
        >
          Se connecter
        </Button>
      </form>

      <p className="mt-8 text-center text-muted">
        Pas encore de compte ?{" "}
        <Link
          href="/register"
          className="text-accent hover:text-accent-400 font-medium transition-[color]"
        >
          Créer un compte
        </Link>
      </p>
    </div>
  );
}
