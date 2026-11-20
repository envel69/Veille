# Atelier de veille

Vous écrivez un résumé de veille, Claude le développe en un rapport complet, et vous téléchargez le PDF. Tout tourne sur votre ordinateur à l'adresse http://localhost:3000.

## Démarrage avec Docker (recommandé)

Prérequis : Docker Desktop (ou Docker Engine + Compose) et une **clé API Anthropic**, à créer sur https://console.anthropic.com/settings/keys. Chaque génération est facturée sur ce compte API (séparé de l'abonnement claude.ai).

```bash
git clone https://github.com/envel69/Veille.git
cd Veille
cp .env.example .env          # puis renseignez la clé et APP_PASSWORD dans .env
docker compose up -d --build
```

Ouvrez **http://localhost:3000** et connectez-vous avec `APP_PASSWORD` (obligatoire avec Docker : sans lui, le serveur refuse de démarrer).

- L'historique des rapports est gardé dans le volume Docker `veille-data` : il survit aux redémarrages et aux mises à jour. `docker compose down -v` le supprime.
- Voir les journaux : `docker compose logs -f`
- Arrêter : `docker compose down`
- Après une mise à jour du code : `git pull` puis `docker compose up -d --build`

Le port n'est ouvert que sur votre machine (`127.0.0.1:3000`). Pour le rendre accessible aux autres postes du réseau, remplacez `"127.0.0.1:3000:3000"` par `"3000:3000"` dans `docker-compose.yml`.

## Démarrage sans Docker

Prérequis : **Node.js 20 ou plus récent** (`node --version`). L'interface est écrite en **Vue.js 3** et compilée avec Vite ; le serveur n'a qu'une dépendance, le SDK officiel Anthropic.

```bash
cp .env.example .env          # puis collez votre clé dans .env
npm install
npm run build                 # compile l'interface Vue dans dist/
npm start
```

Ouvrez **http://localhost:3000**. Arrêt : `Ctrl+C`.

| Commande | Rôle |
|---|---|
| `npm run build` | compile l'interface Vue (`client/` → `dist/`), minifiée, sans source maps |
| `npm start` | lance le serveur (sert `dist/`) |
| `npm run dev` | serveur relancé à chaque modification |
| `npm run dev:client` | interface Vue en rechargement à chaud sur http://localhost:5173 (avec `npm run dev` à côté) |
| `npm run demo` | mode démo, sans clé ni coût (texte fictif) |
| `npm test` | lance les tests |

## Utilisation

1. **Rédiger** : collez vos notes dans l'éditeur, importez un fichier .txt ou .md (bouton ou glisser-déposer), puis choisissez le public et le niveau de détail (5, 7 ou 9 parties). Titre, thème et auteurs sont facultatifs.
2. **Générer** : bouton **Générer le rapport** ou `Ctrl` + `Entrée`. La rédaction se fait **sur le serveur** : un écran suit l'avancement partie par partie, mais vous pouvez fermer l'onglet, le rapport arrivera dans l'Historique (en rouvrant la page pendant la génération, le suivi reprend). En cas d'erreur ou d'annulation, **Reprendre** garde le plan et les parties déjà rédigées et ne refait que le reste.
3. **Résultat** : lecture du rapport avec sommaire latéral cliquable, onglet **PDF** pour voir le vrai fichier, puis **Télécharger le PDF**, **Ouvrir**, **Régénérer** ou **Modifier**.

L'onglet **Historique**, dans l'en-tête, liste tous vos rapports : recherche par titre, thème ou auteur, filtres par niveau et par public, tri, et pour chacun **Ouvrir**, **Télécharger** le PDF ou **Supprimer** (deux clics). Rouvrir ou retélécharger un rapport ne fait aucun nouvel appel à Claude, donc ne coûte rien. Votre brouillon est aussi conservé entre deux visites.

## Contenu du PDF

Page de garde, **sommaire dynamique** (parties et sous-parties cliquables, sur plusieurs pages si besoin, signets dans le panneau latéral du lecteur PDF, lien « Retour au sommaire » en haut de chaque page), synthèse exécutive et points clés, parties d'analyse très développées (3 à 5 sous-parties, exemple concret, implications, encadré, « à retenir »), acteurs, risques et opportunités, trois scénarios d'évolution avec signaux à surveiller, recommandations (priorité et horizon), questions ouvertes, points à vérifier, glossaire, conclusion, et votre résumé d'origine en annexe.

## Bon à savoir

- Claude rédige à partir de votre résumé et de connaissances générales, **sans recherche sur le web**. Les chiffres, dates et faits à contrôler sont listés dans « Points à vérifier ».
- **Mode démo** : lancez `npm run demo` ou mettez `MOCK=1` dans `.env` pour tester la mise en page sans clé ni coût (texte fictif).
- **Changer de modèle** : `ANTHROPIC_MODEL=...` dans `.env` (par défaut `claude-sonnet-5-5`).
- **Historique** : sans Docker, les rapports sont enregistrés dans le dossier `data/` (modifiable avec `DATA_DIR` dans `.env`).
- **Cache de prompts** : les consignes, vos notes et le plan forment un préfixe commun à toutes les parties, mis en cache par l'API ; la première partie part seule, les suivantes dès qu'elle commence à répondre, pour relire ce cache. L'écran de génération affiche la part des jetons lus depuis le cache.
- **Refus** : si Claude décline une demande, l'API la rejoue automatiquement sur un autre modèle (`fallbacks: "default"`, sur les modèles qui le permettent) ; sinon un message clair s'affiche.
- **Mode démo plus lent** : `MOCK_DELAY_MS=200` dans `.env` pour observer l'avancement.
- **Longueur maximale des réponses** : `MAX_TOKENS` dans `.env` (16000 par défaut).
- **Changer de port** : `PORT=8080` dans `.env`.
- Le serveur écoute uniquement sur votre machine (127.0.0.1) : il n'est pas visible depuis le réseau, et la clé reste côté serveur.

## Sécurité

**Ce que montre F12.** Tout ce qu'un navigateur exécute (HTML, CSS, JavaScript) lui est forcément envoyé : n'importe quel site peut être inspecté, c'est normal et on ne peut pas l'empêcher. Bloquer F12 ou le clic droit ne protège rien (le code reste téléchargeable). La sécurité repose donc sur ce qui reste **sur le serveur** :

- **Rien de secret dans le navigateur** : la clé API Anthropic et les prompts restent sur le serveur ; le navigateur n'envoie que des réglages (notes, public, niveau) et ne peut pas envoyer de prompt libre.
- **Code publié compilé** : `npm run build` produit un bundle minifié, sans source maps ni commentaires, avec les outils de développement Vue désactivés. Le code source lisible (`client/`) n'est pas servi.
- **Mot de passe** (`APP_PASSWORD`) : l'interface et toute l'API sont fermées sans connexion. Session dans un cookie `HttpOnly` (illisible par JavaScript) et `SameSite=Strict`, invalidée à la déconnexion. Comparaison en temps constant, 5 essais ratés par 15 minutes et par adresse IP.
- **Anti-CSRF** : toute requête qui modifie des données doit venir du site lui-même (en-tête `Origin`).
- **En-têtes HTTP** : Content-Security-Policy stricte (aucun script externe ni inline, aucun CDN : jsPDF et les polices sont inclus dans le bundle), `X-Frame-Options: DENY` (anti-clickjacking), `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, HSTS si `HTTPS=1`.
- **Limites** : 30 générations par heure et par adresse IP (`JOBS_PER_HOUR`), 3 en parallèle ; erreurs internes journalisées côté serveur sans détail renvoyé au navigateur ; fichiers cachés (`.env`…) jamais servis.
- **Exposé sur Internet** : placez le serveur derrière un proxy HTTPS (Caddy, nginx) avec `HTTPS=1` et `TRUST_PROXY=1`.

## Organisation du code

```
src/
  server.js            point d'entrée (lecture de la config, démarrage)
  config.js            variables d'environnement et fichier .env
  app.js               routes HTTP, flux d'avancement (SSE) et fichiers statiques
  jobs.js              générations côté serveur : plan, parties en parallèle, reprise
  prompts.js           validation des entrées et requêtes (préfixe commun mis en cache)
  services/
    claude.js          appels à Claude via le SDK officiel (cache, refus, repli)
    mock.js            réponses fictives du mode démo
    reports-store.js   historique : un fichier JSON par rapport
  security.js          en-têtes HTTP, connexion, anti-CSRF, limitation des requêtes
client/                interface Vue.js 3 (compilée dans dist/ par Vite)
  index.html
  src/
    main.js            point d'entrée
    App.vue            coque : connexion, en-tête, écrans, notifications
    store.js           état partagé et actions (génération, résultat, historique)
    styles.css         styles
    api/               appels à l'API (session, générations SSE, historique)
    lib/               brouillon local, plan de l'aperçu
    components/        LoginView, ComposeView, BusyView, ResultView, HistoryView, ReportPreview, Icon
shared/                code commun au serveur et à l'interface
  options.js           niveaux et publics
  report-stats.js      statistiques d'un rapport
  pdf-builder.js       mise en page du PDF (jsPDF)
test/                  tests (node --test)
```

### API locale

- `GET /api/session` · `POST /api/login` `{ password }` · `POST /api/logout` : connexion (seules routes ouvertes sans session)
- `GET /api/status` : état du serveur (clé présente, mode démo, modèle)
- `POST /api/jobs` `{ meta }` : lance une génération · `GET /api/jobs` : générations récentes
- `GET /api/jobs/:id/events` : avancement en direct (Server-Sent Events)
- `POST /api/jobs/:id/cancel` · `POST /api/jobs/:id/resume` : annuler, reprendre
- `GET /api/reports` : liste de l'historique · `POST /api/reports` : enregistrer un rapport
- `GET /api/reports/:id` : rapport complet · `DELETE /api/reports/:id` : suppression

Les prompts sont construits côté serveur à partir des métadonnées : le navigateur ne peut pas envoyer de prompt libre, la clé API ne sert donc qu'à générer des rapports.
