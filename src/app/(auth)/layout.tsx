import { Activity } from "lucide-react";

// Force dynamic rendering for auth pages
export const dynamic = "force-dynamic";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-dark via-dark-50 to-dark relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle at 25px 25px, currentColor 2px, transparent 0)`,
              backgroundSize: "50px 50px",
            }}
          />
        </div>

        {/* Glow effects */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-secondary/20 rounded-full blur-3xl" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center p-12 lg:p-16">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-accent/20 rounded-xl">
              <Activity className="h-8 w-8 text-accent" />
            </div>
            <span className="text-2xl font-bold text-foreground">
              ChatYourTraining
            </span>
          </div>

          <h1 className="text-4xl lg:text-5xl font-bold text-foreground mb-6 leading-tight">
            Votre coach IA
            <br />
            <span className="text-gradient">personnalisé</span>
          </h1>

          <p className="text-lg text-muted max-w-md mb-12">
            Centralisez vos données d&apos;entraînement, analysez votre charge
            et bénéficiez de conseils adaptés à votre forme du jour.
          </p>

          {/* Features */}
          <div className="space-y-4">
            {[
              "Synchronisation Strava, Whoop & Garmin",
              "Analyse ATL/CTL/TSB en temps réel",
              "Coach IA contextuel disponible 24/7",
            ].map((feature, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-accent" />
                <span className="text-foreground">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right side - Auth form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="p-2 bg-accent/20 rounded-xl">
              <Activity className="h-6 w-6 text-accent" />
            </div>
            <span className="text-xl font-bold text-foreground">
              ChatYourTraining
            </span>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
