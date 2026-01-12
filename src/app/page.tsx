import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Calendar,
  MessageSquare,
  Zap,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-dark">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-dark-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Activity className="h-6 w-6 text-accent" />
              <span className="text-lg font-bold">ChatYourTraining</span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/login"
                className="text-sm font-medium text-muted hover:text-foreground transition-colors"
              >
                Connexion
              </Link>
              <Link
                href="/register"
                className="px-4 py-2 bg-accent text-dark text-sm font-medium rounded-xl hover:bg-accent-600 transition-colors"
              >
                Commencer
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-accent/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-secondary/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-dark-50 rounded-full border border-dark-200 text-sm text-muted mb-8">
            <Zap className="h-4 w-4 text-accent" />
            <span>Coaching IA pour athlètes d&apos;endurance</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
            Entraînez-vous plus intelligemment
            <br />
            <span className="text-gradient">avec votre Coach IA</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted max-w-2xl mx-auto mb-10">
            Centralisez vos données d&apos;entraînement, analysez votre charge
            et bénéficiez de conseils personnalisés adaptés à votre forme du
            jour.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 bg-accent text-dark font-semibold rounded-xl hover:bg-accent-600 transition-all shadow-glow hover:shadow-glow-lg"
            >
              Commencer gratuitement
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 bg-dark-50 text-foreground font-semibold rounded-xl border border-dark-200 hover:bg-dark-100 transition-all"
            >
              Se connecter
            </Link>
          </div>

          {/* Social proof */}
          <div className="mt-12 flex items-center justify-center gap-8 text-sm text-muted">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-foreground">1,200+</span>
              <span>athlètes actifs</span>
            </div>
            <div className="h-6 w-px bg-dark-200" />
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-foreground">50k+</span>
              <span>séances analysées</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Tout ce dont vous avez besoin
            </h2>
            <p className="text-muted text-lg max-w-2xl mx-auto">
              Une plateforme complète pour optimiser votre entraînement et
              atteindre vos objectifs.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: <BarChart3 className="h-6 w-6" />,
                title: "Analyse de charge",
                description:
                  "Suivez votre ATL, CTL et TSB en temps réel pour optimiser votre forme et éviter le surentraînement.",
              },
              {
                icon: <Calendar className="h-6 w-6" />,
                title: "Calendrier intelligent",
                description:
                  "Visualisez et planifiez vos séances avec une vue claire de votre charge hebdomadaire.",
              },
              {
                icon: <MessageSquare className="h-6 w-6" />,
                title: "Coach IA contextuel",
                description:
                  "Posez vos questions et recevez des conseils personnalisés basés sur vos données réelles.",
              },
              {
                icon: <Activity className="h-6 w-6" />,
                title: "Sync automatique",
                description:
                  "Connectez Strava, Whoop et Garmin pour centraliser automatiquement toutes vos données.",
              },
              {
                icon: <Zap className="h-6 w-6" />,
                title: "Alertes proactives",
                description:
                  "L'IA détecte les signaux de fatigue et vous propose des adaptations avant qu'il ne soit trop tard.",
              },
              {
                icon: <Activity className="h-6 w-6" />,
                title: "Multi-sport",
                description:
                  "Course à pied, cyclisme, natation, triathlon... Gérez tous vos sports dans une seule app.",
              },
            ].map((feature, index) => (
              <div
                key={index}
                className="group p-6 bg-dark-50 rounded-2xl border border-dark-200 hover:border-accent/50 transition-all duration-300"
              >
                <div className="inline-flex p-3 bg-accent/20 rounded-xl text-accent mb-4 group-hover:bg-accent group-hover:text-dark transition-all duration-300">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="relative p-8 sm:p-12 bg-gradient-to-br from-dark-50 to-dark rounded-3xl border border-dark-200 overflow-hidden">
            {/* Background glow */}
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-accent/20 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
            </div>

            <div className="relative text-center">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Prêt à transformer votre entraînement ?
              </h2>
              <p className="text-muted text-lg mb-8 max-w-xl mx-auto">
                Rejoignez des centaines d&apos;athlètes qui optimisent leur
                préparation avec ChatYourTraining.
              </p>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 px-8 py-4 bg-accent text-dark font-semibold rounded-xl hover:bg-accent-600 transition-all shadow-glow hover:shadow-glow-lg"
              >
                Créer mon compte gratuit
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-dark-200">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-accent" />
              <span className="font-semibold">ChatYourTraining</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted">
              <Link
                href="/terms"
                className="hover:text-foreground transition-colors"
              >
                Conditions
              </Link>
              <Link
                href="/privacy"
                className="hover:text-foreground transition-colors"
              >
                Confidentialité
              </Link>
              <Link
                href="/contact"
                className="hover:text-foreground transition-colors"
              >
                Contact
              </Link>
            </div>
            <p className="text-sm text-muted">
              © 2024 ChatYourTraining. Tous droits réservés.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
