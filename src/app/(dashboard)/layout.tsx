"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui";
import {
  Activity,
  LayoutDashboard,
  Calendar,
  Heart,
  Link2,
  User,
  List,
  MessageSquare,
  LogOut,
  Bell,
  ChevronDown,
} from "lucide-react";

const navItems = [
  {
    href: "/dashboard",
    label: "Tableau de bord",
    icon: LayoutDashboard,
  },
  {
    href: "/calendar",
    label: "Calendrier",
    icon: Calendar,
  },
  {
    href: "/workouts",
    label: "Entraînements",
    icon: List,
  },
  {
    href: "/health",
    label: "Santé",
    icon: Heart,
  },
  {
    href: "/integrations",
    label: "Intégrations",
    icon: Link2,
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-dark">
      {/* Sidebar */}
      <aside className="hidden lg:flex lg:fixed lg:top-0 lg:left-0 z-50 h-full w-64 bg-dark-50 border-r border-dark-200 flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-dark-200">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-accent" />
            <span className="font-bold text-lg">ChatYourTraining</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1 flex-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-accent text-dark"
                    : "text-muted hover:text-foreground hover:bg-dark-100"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-dark-200" />
      </aside>

      {/* Main content */}
      <div className="min-h-screen lg:pl-64 pb-20 lg:pb-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-dark/80 backdrop-blur-sm border-b border-dark-200">
          <div className="h-full px-4 lg:px-8 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">
                {navItems.find((item) => item.href === pathname)?.label ||
                  "Dashboard"}
              </h1>
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-3">
              {/* Chat button */}
              <Link
                href="/chat"
                className="flex items-center gap-2 px-4 py-2 bg-accent/20 text-accent rounded-xl hover:bg-accent/30 transition-colors"
              >
                <MessageSquare className="h-4 w-4" />
                <span className="hidden sm:inline text-sm font-medium">
                  Coach IA
                </span>
              </Link>

              {/* Notifications */}
              <button className="relative p-2 text-muted hover:text-foreground hover:bg-dark-100 rounded-xl transition-colors">
                <Bell className="h-5 w-5" />
                <span className="absolute top-1 right-1 h-2 w-2 bg-accent rounded-full" />
              </button>

              <div
                className="relative"
                onMouseEnter={() => setProfileMenuOpen(true)}
                onMouseLeave={() => setProfileMenuOpen(false)}
              >
                <button
                  onClick={() => setProfileMenuOpen((prev) => !prev)}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl border border-transparent hover:border-accent transition-colors"
                >
                  <Avatar size="sm" fallback="JD" />
                  <div className="hidden sm:flex flex-col items-start">
                    <span className="text-sm font-medium">Jean Dupont</span>
                    <span className="text-xs text-muted">
                      Profil & Objectifs
                    </span>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted transition-transform",
                      profileMenuOpen && "rotate-180"
                    )}
                  />
                </button>
                {profileMenuOpen && (
                  <div className="absolute right-0 top-full w-56 bg-dark-50 border border-dark-200 rounded-xl shadow-lg p-2">
                    <Link
                      href="/profile"
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:text-foreground hover:bg-dark-100 transition-colors"
                    >
                      <User className="h-4 w-4" />
                      Profil & Objectifs
                    </Link>
                    <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-error hover:bg-error/10 transition-colors">
                      <LogOut className="h-4 w-4" />
                      Déconnexion
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 pb-24 lg:p-8 lg:pb-8">{children}</main>
      </div>

      {/* Bottom navigation for mobile */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-dark-50 border-t border-dark-200 px-4 py-2 z-40">
        <div className="flex items-center justify-around">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 text-xs font-medium transition-colors",
                  isActive ? "text-accent" : "text-muted"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.label.split(" ")[0]}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
