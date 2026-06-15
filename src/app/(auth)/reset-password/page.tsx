"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";
import { Lock, CheckCircle2, XCircle } from "lucide-react";

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

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  const criteria = checkPassword(password);
  const passwordValid = isPasswordValid(criteria);
  const canSubmit = passwordValid && confirmPassword === password;

  // Supabase sends the session via the URL hash after the user clicks the email link.
  // onAuthStateChange picks it up and exchanges it for a session automatically.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setSessionReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(error.message);
        return;
      }
      router.push("/login?reset=success");
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!sessionReady) {
    return (
      <div className="text-center max-w-md mx-auto">
        <p className="text-muted">
          Vérification du lien de réinitialisation en cours…
        </p>
        <p className="text-sm text-muted mt-4">
          Si vous arrivez sur cette page directement, utilisez le lien reçu par
          e-mail pour réinitialiser votre mot de passe.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Nouveau mot de passe
        </h2>
        <p className="text-muted">Choisissez un nouveau mot de passe sécurisé.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Input
            label="Nouveau mot de passe"
            type="password"
            placeholder="Votre nouveau mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setPasswordTouched(true)}
            leftIcon={<Lock className="h-5 w-5" />}
            required
            autoComplete="new-password"
            autoFocus
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
          disabled={!canSubmit || isLoading}
        >
          Enregistrer le mot de passe
        </Button>
      </form>
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
