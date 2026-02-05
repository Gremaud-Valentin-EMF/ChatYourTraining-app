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
  applicationName: "ChatYourTraining",
  appleWebApp: {
    capable: true,
    title: "ChatYourTraining",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ChatYourTraining" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-dark text-foreground min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
