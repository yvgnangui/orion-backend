# Orion International — Backend CRM & Facturation

Backend NestJS + PostgreSQL (via Prisma). Authentification sécurisée par code
d'accès haché (bcrypt) + session JWT. Intégration FNE volontairement en
pause — voir le commentaire dans `src/commandes/commandes.service.ts`.

## 1. Tester en local

```bash
docker compose up --build
```

L'API démarre sur `http://localhost:3000`. Première fois : lancez la migration
de la base :

```bash
docker compose exec backend npx prisma migrate dev --name init
```

## 2. Déployer en production — étapes qui nécessitent VOTRE compte

Ce sont les seules étapes que je ne peux pas faire à votre place (elles
demandent un moyen de paiement et l'accès à vos comptes) :

### a) Créer le compte d'hébergement (recommandé : Railway)
1. Allez sur railway.app, créez un compte (connexion possible via GitHub).
2. "New Project" → "Deploy from GitHub repo" (poussez d'abord ce dossier sur
   un dépôt GitHub) — ou "Empty Project" puis ajoutez le service manuellement.
3. Ajoutez un service **PostgreSQL** ("+ New" → "Database" → "PostgreSQL") :
   Railway génère automatiquement la variable `DATABASE_URL`.
4. Ajoutez le service backend, reliez-le au dépôt, et copiez les variables de
   `.env.example` dans l'onglet "Variables" (sauf `DATABASE_URL`, déjà fournie).
5. Railway détecte le `Dockerfile` et déploie automatiquement à chaque push.

### b) Réserver le nom de domaine
1. Achetez le domaine chez un registrar (ex. Cloudflare Registrar, ou tout
   autre) — ex. `orion-international.ci` ou `.com`.
2. Dans Railway, onglet "Settings" → "Domains" → "Custom Domain", entrez
   votre sous-domaine choisi (ex. `crm.orion-international.ci`).
3. Railway indique un enregistrement CNAME à ajouter chez votre registrar
   (ou dans Cloudflare DNS si vous l'utilisez).

### c) SSL
Automatique dès que le domaine est connecté — Railway (comme Cloudflare)
génère le certificat SSL sans action supplémentaire de votre part.

### d) Stockage des fichiers (preuves de paiement, factures)
1. Créez un compte Cloudflare, activez R2 (Cloudflare Dashboard → R2).
2. Créez un bucket (ex. `orion-fichiers`), générez une clé API R2.
3. Ces identifiants seront à ajouter aux variables d'environnement du
   backend une fois le module d'upload branché (prochaine étape de code).

## 3. Une fois hébergé

Donnez-moi l'URL de l'API déployée (ex. `https://crm.orion-international.ci`)
et je continue avec :
- le frontend en production (build Next.js + PWA installable, connecté à
  cette API réelle au lieu des données de démonstration)
- le module d'upload des preuves de paiement vers R2
- l'export Excel mensuel automatisé
