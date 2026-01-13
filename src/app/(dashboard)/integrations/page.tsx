"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, Button, Toggle, Badge, Select } from "@/components/ui";
import {
  RefreshCw,
  ExternalLink,
  Clock,
  Activity,
  Moon,
  AlertCircle,
} from "lucide-react";
import type { Tables, IntegrationProvider } from "@/types/database";

interface Integration {
  id: string;
  provider: IntegrationProvider;
  is_active: boolean;
  last_sync_at: string | null;
  scopes: string[] | null;
  sync_config: SyncConfig | null;
}

interface SyncConfig {
  activities?: boolean;
  sleep?: boolean;
  recovery?: boolean;
  workouts?: boolean; // WHOOP workouts (separate from Strava activities)
  hrv?: boolean;
  strain?: boolean;
}

const SYNC_CONFIG_KEYS: (keyof SyncConfig)[] = [
  "activities",
  "sleep",
  "recovery",
  "workouts",
  "hrv",
  "strain",
];

function parseSyncConfig(config: unknown): SyncConfig | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }
  const typedConfig: SyncConfig = {};
  let hasValue = false;

  for (const key of SYNC_CONFIG_KEYS) {
    const value = (config as Record<string, unknown>)[key];
    if (typeof value === "boolean") {
      typedConfig[key] = value;
      hasValue = true;
    }
  }

  return hasValue ? typedConfig : null;
}

interface IntegrationPreference {
  data_type: string;
  preferred_provider: IntegrationProvider;
}

interface SyncOption {
  key: keyof SyncConfig;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

const integrationProviders: {
  id: IntegrationProvider;
  name: string;
  description: string;
  icon: string;
  color: string;
  scopes: string[];
  dataTypes: string[];
  syncOptions: SyncOption[];
}[] = [
  {
    id: "strava",
    name: "Strava",
    description:
      "Synchronisez vos activités sportives (course, vélo, natation).",
    icon: "/icons/strava.svg",
    color: "#FC4C02",
    scopes: ["activity:read_all", "profile:read_all"],
    dataTypes: ["workouts"],
    syncOptions: [
      {
        key: "activities",
        label: "Activités & GPS",
        description: "Course, vélo, natation, etc.",
        defaultEnabled: true,
      },
    ],
  },
  {
    id: "whoop",
    name: "WHOOP",
    description: "Importez vos données de récupération, sommeil et HRV.",
    icon: "/icons/whoop.svg",
    color: "#00D46A",
    scopes: ["read:recovery", "read:sleep", "read:workout"],
    dataTypes: ["sleep", "recovery"],
    syncOptions: [
      {
        key: "sleep",
        label: "Sommeil",
        description: "Durée, phases, qualité",
        defaultEnabled: true,
      },
      {
        key: "recovery",
        label: "Récupération",
        description: "Score de récupération quotidien",
        defaultEnabled: true,
      },
      {
        key: "hrv",
        label: "HRV",
        description: "Variabilité cardiaque",
        defaultEnabled: true,
      },
      {
        key: "strain",
        label: "Strain quotidien",
        description: "Charge journalière WHOOP",
        defaultEnabled: true,
      },
      {
        key: "workouts",
        label: "Workouts WHOOP",
        description: "⚠️ Désactiver si Strava actif (évite doublons)",
        defaultEnabled: false,
      },
    ],
  },
];

const dataTypeLabels: Record<string, { label: string; icon: React.ReactNode }> =
  {
    workouts: {
      label: "Entraînements & GPS",
      icon: <Activity className="h-5 w-5 text-accent" />,
    },
    sleep: {
      label: "Sommeil & Récupération",
      icon: <Moon className="h-5 w-5 text-secondary" />,
    },
    recovery: {
      label: "Récupération",
      icon: <Activity className="h-5 w-5 text-success" />,
    },
  };

function IntegrationsPageContent() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [preferences, setPreferences] = useState<IntegrationPreference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);

  // Get error from URL params
  const urlError = searchParams.get("error");
  const urlErrorDescription = searchParams.get("error_description");

  useEffect(() => {
    loadIntegrations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadIntegrations = async () => {
    setIsLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const [integrationsResult, preferencesResult] = await Promise.all([
        supabase.from("integrations").select("*").eq("user_id", user.id),
        supabase
          .from("integration_preferences")
          .select("*")
          .eq("user_id", user.id),
      ]);

      if (integrationsResult.data) {
        const normalized = integrationsResult.data.map(
          (integration: Tables<"integrations">) => ({
            id: integration.id,
            provider: integration.provider,
            is_active: integration.is_active,
            last_sync_at: integration.last_sync_at,
            scopes: integration.scopes,
            sync_config: parseSyncConfig(integration.sync_config),
          })
        );
        setIntegrations(normalized);
      }
      if (preferencesResult.data) setPreferences(preferencesResult.data);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = (provider: IntegrationProvider) => {
    // Redirect to OAuth flow
    const callbackUrl = `${window.location.origin}/api/${provider}/callback`;

    if (provider === "strava") {
      const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
      if (!clientId) {
        alert("NEXT_PUBLIC_STRAVA_CLIENT_ID n'est pas configuré");
        return;
      }
      const scope = "activity:read_all,profile:read_all";
      const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${callbackUrl}&response_type=code&scope=${scope}`;
      console.log("Strava OAuth URL:", url);
      window.location.href = url;
    } else if (provider === "whoop") {
      const clientId = process.env.NEXT_PUBLIC_WHOOP_CLIENT_ID;
      console.log("Whoop Client ID:", clientId);
      console.log("Callback URL:", callbackUrl);

      if (!clientId) {
        alert(
          "NEXT_PUBLIC_WHOOP_CLIENT_ID n'est pas configuré dans .env.local\n\nAjoutez:\nNEXT_PUBLIC_WHOOP_CLIENT_ID=votre_client_id"
        );
        return;
      }

      // Generate a random state for CSRF protection (required by Whoop)
      const state = crypto.randomUUID();
      sessionStorage.setItem("whoop_oauth_state", state);

      // Whoop scopes - include 'offline' for refresh token and 'read:cycles' for recovery data
      const scope = encodeURIComponent(
        "offline read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement"
      );
      const url = `https://api.prod.whoop.com/oauth/oauth2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
        callbackUrl
      )}&response_type=code&scope=${scope}&state=${state}`;
      console.log("Whoop OAuth URL:", url);
      window.location.href = url;
    }
  };

  const handleDisconnect = async (provider: IntegrationProvider) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("integrations")
      .delete()
      .eq("user_id", user.id)
      .eq("provider", provider);

    loadIntegrations();
  };

  const handleSync = async (provider: IntegrationProvider) => {
    setIsSyncing(provider);
    try {
      const response = await fetch(`/api/sync/${provider}`, { method: "POST" });
      if (!response.ok) throw new Error("Sync failed");
      await loadIntegrations();
    } catch (error) {
      console.error("Sync error:", error);
    } finally {
      setIsSyncing(null);
    }
  };

  const handleToggle = async (
    provider: IntegrationProvider,
    isActive: boolean
  ) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("integrations")
      .update({ is_active: isActive })
      .eq("user_id", user.id)
      .eq("provider", provider);

    loadIntegrations();
  };

  const handlePreferenceChange = async (
    dataType: string,
    provider: IntegrationProvider
  ) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("integration_preferences").upsert({
      user_id: user.id,
      data_type: dataType,
      preferred_provider: provider,
    });

    loadIntegrations();
  };

  const handleSyncConfigChange = async (
    provider: IntegrationProvider,
    key: keyof SyncConfig,
    enabled: boolean
  ) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const integration = getIntegration(provider);
    if (!integration) return;

    const currentConfig = integration.sync_config || {};
    const newConfig = { ...currentConfig, [key]: enabled };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("integrations")
      .update({ sync_config: newConfig })
      .eq("id", integration.id);

    // Update local state immediately
    setIntegrations((prev) =>
      prev.map((i) =>
        i.id === integration.id ? { ...i, sync_config: newConfig } : i
      )
    );
  };

  const getSyncConfigValue = (
    integration: Integration | undefined,
    key: keyof SyncConfig,
    defaultValue: boolean
  ): boolean => {
    if (!integration?.sync_config) return defaultValue;
    return integration.sync_config[key] ?? defaultValue;
  };

  const getIntegration = (provider: IntegrationProvider) =>
    integrations.find((i) => i.provider === provider);

  const formatLastSync = (date: string | null) => {
    if (!date) return "Jamais";
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 60) return `il y a ${minutes}m`;
    if (hours < 24) return `il y a ${hours}h`;
    return d.toLocaleDateString("fr-FR");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="h-8 w-8 text-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold mb-2">Gestion des Intégrations</h1>
        <p className="text-muted">
          Gérez vos connexions tierces et la priorité des données
        </p>
      </div>

      {/* Error display */}
      {urlError && (
        <div className="p-4 bg-error/10 border border-error/30 rounded-xl flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-error flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-error">
              Erreur de connexion: {urlError}
            </p>
            {urlErrorDescription && (
              <p className="text-sm text-muted mt-1">
                {decodeURIComponent(urlErrorDescription)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Sync all button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-4 bg-dark-50 rounded-xl border border-dark-200">
        <p className="text-sm text-muted">
          Connectez vos services favoris pour centraliser vos données
          d&apos;entraînement, de sommeil et de récupération.
        </p>
        <Button
          className="w-full sm:w-auto"
          onClick={() => {
            integrations
              .filter((i) => i.is_active)
              .forEach((i) => handleSync(i.provider));
          }}
          leftIcon={<RefreshCw className="h-4 w-4" />}
        >
          Tout synchroniser
        </Button>
      </div>

      {/* Integrations list */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span className="h-2 w-2 bg-accent rounded-full" />
          Applications Disponibles
        </h2>

        <div className="grid md:grid-cols-2 gap-4">
          {integrationProviders.map((provider) => {
            const integration = getIntegration(provider.id);
            const isConnected = !!integration;
            const isActive = integration?.is_active ?? false;

            return (
              <Card
                key={provider.id}
                variant={isConnected ? "default" : "default"}
                className={isConnected && isActive ? "border-accent/50" : ""}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl font-bold"
                      style={{
                        backgroundColor: `${provider.color}20`,
                        color: provider.color,
                      }}
                    >
                      {provider.name[0]}
                    </div>
                    <div>
                      <h3 className="font-semibold">{provider.name}</h3>
                      {isConnected ? (
                        <Badge variant="success" size="sm">
                          CONNECTÉ
                        </Badge>
                      ) : (
                        <Badge variant="outline" size="sm">
                          DÉCONNECTÉ
                        </Badge>
                      )}
                    </div>
                  </div>

                  {isConnected && (
                    <Toggle
                      checked={isActive}
                      onChange={(e) =>
                        handleToggle(provider.id, e.target.checked)
                      }
                    />
                  )}
                </div>

                <p className="text-sm text-muted mb-4">
                  {provider.description}
                </p>

                {isConnected && (
                  <>
                    {/* Sync options */}
                    <div className="mb-4 space-y-2">
                      <p className="text-xs text-muted font-medium uppercase tracking-wider mb-2">
                        Données à synchroniser
                      </p>
                      {provider.syncOptions.map((option) => (
                        <div
                          key={option.key}
                          className="flex flex-col gap-2 sm:flex-row sm:items-center justify-between py-2 px-3 bg-dark-100 rounded-lg"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {option.label}
                            </p>
                            <p className="text-xs text-muted truncate">
                              {option.description}
                            </p>
                          </div>
                          <Toggle
                            checked={getSyncConfigValue(
                              integration,
                              option.key,
                              option.defaultEnabled
                            )}
                            onChange={(e) =>
                              handleSyncConfigChange(
                                provider.id,
                                option.key,
                                e.target.checked
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>

                    {/* Last sync */}
                    <div className="flex items-center gap-2 text-sm text-muted mb-4">
                      <Clock className="h-4 w-4" />
                      <span>
                        Dernière synchro:{" "}
                        {formatLastSync(integration?.last_sync_at ?? null)}
                      </span>
                    </div>
                  </>
                )}

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-dark-200">
                  {isConnected ? (
                    <>
                      <button
                        onClick={() => handleSync(provider.id)}
                        disabled={isSyncing === provider.id || !isActive}
                        className="text-sm text-accent hover:underline disabled:opacity-50"
                      >
                        {isSyncing === provider.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin inline mr-1" />
                        ) : null}
                        Synchroniser
                      </button>
                      <span className="text-dark-300">•</span>
                      <button
                        onClick={() => handleDisconnect(provider.id)}
                        className="text-sm text-error hover:underline"
                      >
                        Déconnecter
                      </button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => handleConnect(provider.id)}
                      rightIcon={<ExternalLink className="h-4 w-4" />}
                    >
                      Connecter le compte
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Source priorities */}
      <div>
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <span className="h-2 w-2 bg-secondary rounded-full" />
          Priorité des Sources
        </h2>
        <p className="text-sm text-muted mb-4">
          Définissez quelle application a la priorité en cas de conflit de
          données.
        </p>

        <Card>
          <div className="space-y-4">
            {Object.entries(dataTypeLabels).map(
              ([dataType, { label, icon }]) => {
                const preference = preferences.find(
                  (p) => p.data_type === dataType
                );
                const availableProviders = integrationProviders.filter(
                  (p) =>
                    p.dataTypes.includes(dataType) &&
                    getIntegration(p.id)?.is_active
                );

                return (
                  <div
                    key={dataType}
                    className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-4 bg-dark-100 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      {icon}
                      <div>
                        <p className="font-medium">{label}</p>
                        <p className="text-xs text-muted">
                          {dataType === "workouts"
                            ? "Source principale pour les activités"
                            : dataType === "sleep"
                            ? "Analyse du repos"
                            : dataType === "recovery"
                            ? "Score de récupération"
                            : "Calories et macros"}
                        </p>
                      </div>
                    </div>

                    <Select
                      options={[
                        { value: "", label: "Aucune source" },
                        ...availableProviders.map((p) => ({
                          value: p.id,
                          label: p.name,
                        })),
                      ]}
                      value={preference?.preferred_provider || ""}
                      onChange={(e) =>
                        handlePreferenceChange(
                          dataType,
                          e.target.value as IntegrationProvider
                        )
                      }
                      className="w-full sm:w-40"
                    />
                  </div>
                );
              }
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-96">
          <RefreshCw className="h-8 w-8 text-accent animate-spin" />
        </div>
      }
    >
      <IntegrationsPageContent />
    </Suspense>
  );
}
