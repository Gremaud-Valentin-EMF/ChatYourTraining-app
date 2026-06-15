"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";
import { Mail, Lock, User, CheckCircle2, XCircle } from "lucide-react";

interface PasswordCriteria {
  minLength: boolean;
  hasUppercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

function checkPassword(password: string): PasswordCriteria {
  return {
    minLength: password.length >= 12,
    hasUppercase: /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };
}

function isPasswordValid(criteria: PasswordCriteria): boolean {
  return Object.values(criteria).every(Boolean);
}

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
  const [passwordTouched, setPasswordTouched] = useState(false);

  const criteria = checkPassword(password);
  const passwordValid = isPasswordValid(criteria);
  const canSubmit = passwordValid && confirmPassword === password && fullName && email;

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    if (!passwordValid) {
      setPasswordTouched(true);
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        if (
          error.message.toLowerCase().includes("already registered") ||
          error.message.toLowerCase().includes("already exists") ||
          error.message.toLowerCase().includes("user already")
        ) {
          setError("already_exists");
        } else {
          setError(error.message);
        }
        return;
      }

      // Supabase may return a user with identities=[] when email is already registered
      // (when email confirmation is enabled it silently returns a fake user)
      if (data.user && data.user.identities?.length === 0) {
        setError("already_exists");
        return;
      }

      if (data.user && !data.session) {
        setShowConfirmation(true);
      } else if (data.session) {
        router.push("/onboarding");
        router.refresh();
      }
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsLoading(false);
    }
  };

  if (showConfirmation) {
    return (
      <div className="text-center max-w-md mx-auto">
        <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <Mail className="h-8 w-8 text-accent" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Vérifiez votre boîte mail
        </h2>
        <p className="text-muted mb-6">
          Nous avons envoyé un lien de confirmation à{" "}
          <strong className="text-foreground">{email}</strong>
        </p>
        <p className="text-sm text-muted mb-6">
          Cliquez sur le lien dans l&apos;e-mail pour activer votre compte et
          accéder à l&apos;application.
        </p>
        <Button variant="secondary" onClick={() => setShowConfirmation(false)}>
          Utiliser une autre adresse
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Créer un compte
        </h2>
        <p className="text-muted">
          Commencez votre parcours d&apos;entraînement intelligent
        </p>
      </div>

      <form onSubmit={handleEmailRegister} className="space-y-4">
        <Input
          label="Nom complet"
          type="text"
          placeholder="Prénom Nom"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          leftIcon={<User className="h-5 w-5" />}
          required
          autoComplete="name"
        />

        <Input
          label="Email"
          type="email"
          placeholder="Votre email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null); }}
          leftIcon={<Mail className="h-5 w-5" />}
          required
          autoComplete="email"
        />

        <div>
          <Input
            label="Mot de passe"
            type="password"
            placeholder="Votre mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setPasswordTouched(true)}
            leftIcon={<Lock className="h-5 w-5" />}
            required
            autoComplete="new-password"
          />
          {passwordTouched && (
            <ul className="mt-2 space-y-1">
              <CriteriaItem ok={criteria.minLength} label="Au moins 12 caractères" />
              <CriteriaItem ok={criteria.hasUppercase} label="Une majuscule" />
              <CriteriaItem ok={criteria.hasNumber} label="Un chiffre" />
              <CriteriaItem ok={criteria.hasSpecial} label="Un caractère spécial" />
            </ul>
          )}
        </div>

        <Input
          label="Confirmer le mot de passe"
          type="password"
          placeholder="Confirmez votre mot de passe"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          leftIcon={<Lock className="h-5 w-5" />}
          required
          autoComplete="new-password"
        />

        {error && error !== "already_exists" && (
          <div className="p-3 bg-error/10 border border-error/20 rounded-xl text-error text-sm">
            {error}
          </div>
        )}

        {error === "already_exists" && (
          <div className="p-3 bg-error/10 border border-error/20 rounded-xl text-error text-sm">
            Cette adresse e-mail est déjà utilisée.{" "}
            <Link href="/login" className="underline font-medium hover:opacity-80">
              Se connecter
            </Link>
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          isLoading={isLoading}
          disabled={!canSubmit || isLoading}
        >
          Créer mon compte
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        En créant un compte, vous acceptez nos{" "}
        <Link href="/terms" className="text-accent hover:text-accent-400 transition-[color]">
          conditions d&apos;utilisation
        </Link>{" "}
        et notre{" "}
        <Link href="/privacy" className="text-accent hover:text-accent-400 transition-[color]">
          politique de confidentialité
        </Link>
        .
      </p>

      <p className="mt-6 text-center text-muted">
        Déjà un compte ?{" "}
        <Link
          href="/login"
          className="text-accent hover:text-accent-400 font-medium transition-[color]"
        >
          Se connecter
        </Link>
      </p>
    </div>
  );
}

function CriteriaItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-2 text-xs ${ok ? "text-success" : "text-error"}`}>
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <XCircle className="h-3.5 w-3.5 shrink-0" />
      )}
      {label}
    </li>
  );
}
