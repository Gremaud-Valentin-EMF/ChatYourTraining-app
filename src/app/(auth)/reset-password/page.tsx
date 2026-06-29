"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";
import { Lock, CheckCircle2, XCircle, AlertTriangle, ArrowLeft } from "lucide-react";

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
  const [status, setStatus] = useState<"verifying" | "ready" | "invalid">(
    "verifying"
  );

  const criteria = checkPassword(password);
  const passwordValid = isPasswordValid(criteria);
  const canSubmit = passwordValid && confirmPassword === password;

  // Establish the recovery session from the password-reset link before showing the form.
  // The link lands here either with the session tokens in the URL hash (implicit flow,
  // e.g. #access_token=…&type=recovery) or with a ?code= to exchange (PKCE flow). The
  // @supabase/ssr browser client does NOT auto-detect implicit-hash sessions, so we set
  // it explicitly. An expired / invalid / already-used link instead carries an `error`
  // in the hash (e.g. #error=access_denied&error_code=otp_expired); if no recovery
  // session can be established, the link is treated as invalid.
  useEffect(() => {
    let active = true;
    const markReady = () => {
      if (active) setStatus("ready");
    };
    const markInvalid = () => {
      if (active) setStatus("invalid");
    };
    // Strip the tokens from the URL once consumed so they don't linger in history.
    const clearHash = () => {
      window.history.replaceState(null, "", window.location.pathname);
    };

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (hash.get("error") || hash.get("error_code")) {
      markInvalid();
      return;
    }

    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");

    if (accessToken && refreshToken) {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          clearHash();
          if (error) markInvalid();
          else markReady();
        });
      return () => {
        active = false;
      };
    }

    // PKCE / already-established session: the client auto-exchanges ?code= on init.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) markReady();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (
          event === "PASSWORD_RECOVERY" ||
          ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session)
        ) {
          markReady();
        }
      }
    );

    // Fallback: if no recovery session (and no error) arrives, the link is unusable.
    const timeout = setTimeout(() => {
      if (active) setStatus((prev) => (prev === "verifying" ? "invalid" : prev));
    }, 8000);

    return () => {
      active = false;
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
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
      // Invalidate every active session (this device + any other) so the old
      // password can no longer be used anywhere (AC2).
      await supabase.auth.signOut({ scope: "global" });
      router.push("/login?reset=success");
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "verifying") {
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

  if (status === "invalid") {
    return (
      <div className="text-center max-w-md mx-auto">
        <div className="w-16 h-16 bg-error/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="h-8 w-8 text-error" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Lien invalide</h2>
        <div className="p-3 bg-error/10 border border-error/20 rounded-xl text-error text-sm mb-8">
          Ce lien est expiré ou invalide
        </div>
        <Link href="/forgot-password">
          <Button variant="primary" size="lg" className="w-full">
            Faire une nouvelle demande
          </Button>
        </Link>
        <p className="mt-6 text-center text-muted">
          <Link
            href="/login"
            className="text-accent hover:text-accent-400 font-medium transition-[color] flex items-center justify-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à la connexion
          </Link>
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
