"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      // Intentionally swallowed — always show generic confirmation
    } finally {
      setIsLoading(false);
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <div className="text-center max-w-md mx-auto">
        <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="h-8 w-8 text-accent" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          E-mail envoyé
        </h2>
        <p className="text-muted mb-6">
          Si un compte est associé à{" "}
          <strong className="text-foreground">{email}</strong>, vous recevrez un
          lien pour réinitialiser votre mot de passe.
        </p>
        <p className="text-sm text-muted mb-8">
          Pensez à vérifier votre dossier spam si vous ne le recevez pas dans
          quelques minutes.
        </p>
        <Link
          href="/login"
          className="text-accent hover:text-accent-400 font-medium transition-[color] flex items-center justify-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Mot de passe oublié ?
        </h2>
        <p className="text-muted">
          Entrez votre adresse e-mail et nous vous enverrons un lien de
          réinitialisation.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          placeholder="Votre email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          leftIcon={<Mail className="h-5 w-5" />}
          required
          autoComplete="email"
          autoFocus
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          isLoading={isLoading}
          disabled={!email || isLoading}
        >
          Envoyer le lien
        </Button>
      </form>

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
