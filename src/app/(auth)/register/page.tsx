"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";
import { Mail, Lock, User, Chrome } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      // Check if user needs to confirm email
      if (data.user && !data.session) {
        // Email confirmation required
        setShowConfirmation(true);
      } else if (data.session) {
        // No email confirmation needed, user is logged in
        router.push("/onboarding");
        router.refresh();
      }
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
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

  // Show confirmation message if email needs to be verified
  if (showConfirmation) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <Mail className="h-8 w-8 text-accent" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Vérifiez votre email
        </h2>
        <p className="text-muted mb-6">
          Nous avons envoyé un lien de confirmation à{" "}
          <strong className="text-foreground">{email}</strong>
        </p>
        <p className="text-sm text-muted mb-6">
          Cliquez sur le lien dans l&apos;email pour activer votre compte et
          accéder à l&apos;application.
        </p>
        <Button variant="secondary" onClick={() => setShowConfirmation(false)}>
          Utiliser une autre adresse
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Créer un compte
        </h2>
        <p className="text-muted">
          Commencez votre parcours d&apos;entraînement intelligent
        </p>
      </div>

      {/* Google Register */}
      <Button
        variant="secondary"
        size="lg"
        className="w-full mb-6"
        onClick={handleGoogleRegister}
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

      {/* Email Register Form */}
      <form onSubmit={handleEmailRegister} className="space-y-4">
        <Input
          label="Nom complet"
          type="text"
          placeholder="Jean Dupont"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          leftIcon={<User className="h-5 w-5" />}
          required
          autoComplete="name"
        />

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
          hint="Minimum 8 caractères"
          required
          autoComplete="new-password"
        />

        <Input
          label="Confirmer le mot de passe"
          type="password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          leftIcon={<Lock className="h-5 w-5" />}
          required
          autoComplete="new-password"
        />

        {error && (
          <div className="p-3 bg-error/10 border border-error/20 rounded-xl text-error text-sm">
            {error}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          isLoading={isLoading}
        >
          Créer mon compte
        </Button>
      </form>

      {/* Terms */}
      <p className="mt-6 text-center text-sm text-muted">
        En créant un compte, vous acceptez nos{" "}
        <Link href="/terms" className="text-accent hover:text-accent-400">
          conditions d&apos;utilisation
        </Link>{" "}
        et notre{" "}
        <Link href="/privacy" className="text-accent hover:text-accent-400">
          politique de confidentialité
        </Link>
        .
      </p>

      {/* Login link */}
      <p className="mt-6 text-center text-muted">
        Déjà un compte ?{" "}
        <Link
          href="/login"
          className="text-accent hover:text-accent-400 font-medium transition-colors"
        >
          Se connecter
        </Link>
      </p>
    </div>
  );
}
