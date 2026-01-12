"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";
import { Mail, Lock, Chrome } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setError(error.message);
      }
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Content de vous revoir !
        </h2>
        <p className="text-muted">
          Connectez-vous pour accéder à votre tableau de bord
        </p>
      </div>

      {/* Google Login */}
      <Button
        variant="secondary"
        size="lg"
        className="w-full mb-6"
        onClick={handleGoogleLogin}
        disabled={isLoading}
        leftIcon={<Chrome className="h-5 w-5" />}
      >
        Continuer avec Google
      </Button>

      {/* Divider */}
      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-dark-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-dark text-muted">ou</span>
        </div>
      </div>

      {/* Email Login Form */}
      <form onSubmit={handleEmailLogin} className="space-y-4">
        <Input
          label="Email"
          type="email"
          placeholder="vous@exemple.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          leftIcon={<Mail className="h-5 w-5" />}
          required
          autoComplete="email"
        />

        <Input
          label="Mot de passe"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
            className="text-sm text-accent hover:text-accent-400 transition-colors"
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
        >
          Se connecter
        </Button>
      </form>

      {/* Register link */}
      <p className="mt-8 text-center text-muted">
        Pas encore de compte ?{" "}
        <Link
          href="/register"
          className="text-accent hover:text-accent-400 font-medium transition-colors"
        >
          Créer un compte
        </Link>
      </p>
    </div>
  );
}
