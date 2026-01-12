This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Guide de déploiement sur Vercel

### Prérequis

- Un compte Vercel relié à votre fournisseur Git (GitHub, GitLab ou Bitbucket).
- Node.js 18+ et npm/pnpm/bun installés localement pour vérifier que le build passe (`npm run build`).
- Un projet Supabase configuré et les identifiants API des fournisseurs externes (Strava, Whoop, OpenAI ou Gemini).

### 1. Préparer l'application localement

1. Installez les dépendances avec `npm install`.
2. Copiez vos secrets dans `.env.local` (voir tableau plus bas) et lancez `npm run dev` pour vérifier l'app en local.
3. Avant de pousser du code, exécutez `npm run lint` puis `npm run build`. Corrigez les éventuels warnings bloquants : Vercel n'exécutera pas `next build` si cette étape échoue.

### 2. Créer (ou connecter) le projet Vercel

- Via le dashboard Vercel : `Add New... > Project`, sélectionnez le dépôt Git contenant cette application et gardez les paramètres par défaut (`Framework Preset: Next.js`, `Build Command: next build`, `Output Directory: .next`).
- Via CLI : `npm i -g vercel`, puis `vercel login` et `vercel` pour initialiser. Pour un déploiement direct sans Git, utilisez `vercel --prod`.

### 3. Déclarer les variables d'environnement

Reproduisez l'intégralité de votre `.env.local` dans Vercel (`Project Settings > Environment Variables`). Les variables `NEXT_PUBLIC_*` sont exposées au navigateur, les autres doivent rester uniquement côté serveur.

| Variable | Portée conseillée | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Preview + Production | URL REST de votre projet Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Preview + Production | Clé publique Supabase pour les appels client. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only (Preview + Production) | Clé Service Role utilisée par les API routes pour gérer les profils/analyses. |
| `OPENAI_API_KEY` | Server only | Clé OpenAI si `AI_PROVIDER=openai`. |
| `OPENAI_MAX_OUTPUT_TOKENS` | Server only | Limite de tokens pour les réponses OpenAI. |
| `GOOGLE_GEMINI_API_KEY` | Server only | Clé Google AI Studio si `AI_PROVIDER=gemini`. |
| `GOOGLE_GEMINI_MODEL` | Server only | ID de modèle Gemini (ex : `gemini-1.5-flash`). |
| `GOOGLE_GEMINI_MAX_OUTPUT_TOKENS` | Server only | Limite tokens pour Gemini. |
| `AI_PROVIDER` | Preview + Production | Valeur `openai` ou `gemini` selon le moteur sélectionné. |
| `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | Server only | Identifiants confidentiels Strava pour l'échange de tokens. |
| `STRAVA_REDIRECT_URI` | Server only | URL de redirection OAuth enregistrée chez Strava (ex : `https://<project>.vercel.app/api/auth/strava/callback`). |
| `NEXT_PUBLIC_STRAVA_CLIENT_ID` | Preview + Production | Identifiant Strava affiché dans l'UI d'intégration. |
| `WHOOP_CLIENT_ID` / `WHOOP_CLIENT_SECRET` | Server only | Identifiants OAuth Whoop. |
| `WHOOP_REDIRECT_URI` | Server only | Même URL que déclarée côté Whoop. |
| `NEXT_PUBLIC_WHOOP_CLIENT_ID` | Preview + Production | Identifiant Whoop pour l'UI. |

Astuce : utilisez `vercel env add VARIABLE_NAME` ou importez un fichier avec `vercel env pull .env.local && vercel env push`.

### 4. Lancer le premier déploiement

1. Poussez votre branche principale (`main` ou `master`). Vercel déclenche automatiquement un déploiement Preview.
2. Vérifiez les logs (`Deployments > View Build Logs`) pour confirmer que `next build` et les appels Supabase réussissent.
3. Promouvez vers la production via le bouton **Promote to Production** ou en poussant sur la branche de prod configurée.

### 5. Vérifications post-déploiement

- Ouvrez `https://<project>.vercel.app` et testez la connexion à Supabase (tableaux d'entraînement, import Strava/Whoop).
- Réalisez un parcours OAuth Strava/Whoop pour valider que `STRAVA_REDIRECT_URI` / `WHOOP_REDIRECT_URI` pointent bien vers votre domaine Vercel.
- Inspectez l'onglet `Functions` dans Vercel si vos API routes (intégrations, webhooks) doivent rester sur la région `iad1` par défaut ; adaptez `Regional Edge` si besoin.

### 6. Mises à jour continues

- Chaque `git push` déclenche un environnement Preview isolé : utilisez-le pour tester et commenter avant fusion.
- Pour des correctifs urgents, `vercel --prod` déploie directement la branche courante.
- Pensez à synchroniser les variables d'environnement entre `Preview`, `Production` et `Development` (via `vercel env pull`) pour conserver un comportement homogène.
