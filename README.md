# Atelier de veille

Vous écrivez un résumé de veille, Claude le développe en un rapport complet, et vous téléchargez le PDF. Tout tourne sur votre ordinateur à l'adresse http://localhost:3000.

## Démarrage avec Docker (recommandé)

Prérequis : Docker Desktop (ou Docker Engine + Compose) et une **clé API Anthropic**, à créer sur https://console.anthropic.com/settings/keys. Chaque génération est facturée sur ce compte API (séparé de l'abonnement claude.ai).

```bash
git clone https://github.com/envel69/Veille.git
cd Veille
cp .env.example .env          # puis collez votre clé dans .env
docker compose up -d --build
```

Ouvrez **http://localhost:3000**.

- L'historique des rapports est gardé dans le volume Docker `veille-data` : il survit aux redémarrages et aux mises à jour. `docker compose down -v` le supprime.
- Voir les journaux : `docker compose logs -f`
- Arrêter : `docker compose down`
- Après une mise à jour du code : `git pull` puis `docker compose up -d --build`

Le port n'est ouvert que sur votre machine (`127.0.0.1:3000`). Pour le rendre accessible aux autres postes du réseau, remplacez `"127.0.0.1:3000:3000"` par `"3000:3000"` dans `docker-compose.yml`.

## Démarrage sans Docker

Prérequis : **Node.js 18 ou plus récent** (`node --version`). Aucun `npm install` : le projet n'a pas de dépendances.

```bash
cp .env.example .env          # puis collez votre clé dans .env
npm start
```

Ouvrez **http://localhost:3000**. Arrêt : `Ctrl+C`.

| Commande | Rôle |
|---|---|
| `npm start` | lance le serveur |
| `npm run dev` | relance automatiquement à chaque modification |
| `npm run demo` | mode démo, sans clé ni coût (texte fictif) |
| `npm test` | lance les tests (le test du sommaire PDF demande `npm install --no-save jspdf@2.5.1`) |

## Utilisation

1. **Rédiger** : collez vos notes dans l'éditeur, importez un fichier .txt ou .md (bouton ou glisser-déposer), puis choisissez le public et le niveau de détail (5, 7 ou 9 parties). Titre, thème et auteurs sont facultatifs.
2. **Générer** : bouton **Générer le rapport** ou `Ctrl` + `Entrée`. Un écran suit l'avancement partie par partie (2 à 5 minutes, les parties sont rédigées trois par trois). En cas d'erreur : **Relancer** ou **Modifier le résumé**.
3. **Résultat** : lecture du rapport avec sommaire latéral cliquable, onglet **PDF** pour voir le vrai fichier, puis **Télécharger le PDF**, **Ouvrir**, **Régénérer** ou **Modifier**.

L'onglet **Historique**, dans l'en-tête, liste tous vos rapports : recherche par titre, thème ou auteur, filtres par niveau et par public, tri, et pour chacun **Ouvrir**, **Télécharger** le PDF ou **Supprimer** (deux clics). Rouvrir ou retélécharger un rapport ne fait aucun nouvel appel à Claude, donc ne coûte rien. Votre brouillon est aussi conservé entre deux visites.

## Contenu du PDF

Page de garde, **sommaire dynamique** (parties et sous-parties cliquables, sur plusieurs pages si besoin, signets dans le panneau latéral du lecteur PDF, lien « Retour au sommaire » en haut de chaque page), synthèse exécutive et points clés, parties d'analyse très développées (3 à 5 sous-parties, exemple concret, implications, encadré, « à retenir »), acteurs, risques et opportunités, trois scénarios d'évolution avec signaux à surveiller, recommandations (priorité et horizon), questions ouvertes, points à vérifier, glossaire, conclusion, et votre résumé d'origine en annexe.

## Bon à savoir

- Claude rédige à partir de votre résumé et de connaissances générales, **sans recherche sur le web**. Les chiffres, dates et faits à contrôler sont listés dans « Points à vérifier ».
- **Mode démo** : lancez `npm run demo` ou mettez `MOCK=1` dans `.env` pour tester la mise en page sans clé ni coût (texte fictif).
- **Changer de modèle** : `ANTHROPIC_MODEL=...` dans `.env` (par défaut `claude-sonnet-5-5`).
- **Historique** : sans Docker, les rapports sont enregistrés dans le dossier `data/` (modifiable avec `DATA_DIR` dans `.env`).
- **Longueur maximale des réponses** : `MAX_TOKENS` dans `.env` (16000 par défaut).
- **Changer de port** : `PORT=8080` dans `.env`.
- Le serveur écoute uniquement sur votre machine (127.0.0.1) : il n'est pas visible depuis le réseau, et la clé reste côté serveur.

## Organisation du code

```
src/
  server.js            point d'entrée (lecture de la config, démarrage)
  config.js            variables d'environnement et fichier .env
  app.js               routes HTTP et fichiers statiques
  prompts.js           validation des entrées et construction des prompts
  services/
    anthropic.js       appel à l'API Anthropic en streaming
    mock.js            réponses fictives du mode démo
    reports-store.js   historique : un fichier JSON par rapport
public/
  index.html           structure de la page
  css/styles.css       styles (thème clair et sombre)
  js/
    app.js             interface : écrans rédaction, génération, résultat
    api.js             client de l'API locale (streaming, relances)
    generator.js       enchaînement plan puis parties
    preview.js         aperçu HTML du rapport
    pdf-builder.js     mise en page du PDF (jsPDF)
    draft.js           brouillon gardé dans le navigateur
    history.js         client de l'historique (et reprise de l'ancien historique du navigateur)
    options.js         niveaux et publics, partagés avec le serveur
test/                  tests (node --test)
```

### API locale

- `GET /api/status` : état du serveur (clé présente, mode démo, modèle)
- `POST /api/plan` `{ meta }` : plan du rapport (flux texte contenant du JSON)
- `POST /api/section` `{ meta, plan, index }` : rédaction d'une partie
- `GET /api/reports` : liste de l'historique · `POST /api/reports` : enregistrer un rapport
- `GET /api/reports/:id` : rapport complet · `DELETE /api/reports/:id` : suppression

Les prompts sont construits côté serveur à partir de ces données : le navigateur ne peut pas envoyer de prompt libre, la clé API ne sert donc qu'à générer des rapports.
