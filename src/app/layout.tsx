import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "ChatYourTraining - Coach IA pour Athlètes d'Endurance",
  description:
    "Plateforme d'entraînement intelligente dédiée aux sportifs d'endurance. Centralisez vos données et bénéficiez d'un coaching IA personnalisé.",
  keywords: [
    "entraînement",
    "endurance",
    "course à pied",
    "cyclisme",
    "triathlon",
    "coach IA",
    "training",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-dark text-foreground min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
