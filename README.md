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

- Voir les journaux : `docker compose logs -f`
- Arrêter : `docker compose down`
- Après une mise à jour du code : `git pull` puis `docker compose up -d --build`

Le port n'est ouvert que sur votre machine (`127.0.0.1:3000`). Pour le rendre accessible aux autres postes du réseau, remplacez `"127.0.0.1:3000:3000"` par `"3000:3000"` dans `docker-compose.yml`.

## Démarrage sans Docker

Prérequis : **Node.js 18 ou plus récent** (`node --version`). Aucun `npm install` : le projet n'a pas de dépendances.

```bash
cp .env.example .env          # puis collez votre clé dans .env
node server.js
```

Ouvrez **http://localhost:3000**. Arrêt : `Ctrl+C`.

## Utilisation

1. À gauche, écrivez ou collez votre résumé (points en vrac acceptés), puis choisissez les destinataires et le niveau de détail (4, 6 ou 8 parties développées).
2. Cliquez sur **Générer le rapport détaillé**. Comptez une à trois minutes.
3. À droite : **Télécharger le PDF**, **Ouvrir dans un onglet** ou **Régénérer**. Un aperçu du contenu est affiché sous les boutons.

Votre brouillon est gardé dans le navigateur entre deux visites.

## Contenu du PDF

Page de garde, sommaire paginé, synthèse exécutive et points clés, parties d'analyse développées (sous-parties, encadré, « à retenir »), acteurs, risques et opportunités, recommandations (priorité et horizon), questions ouvertes, points à vérifier, glossaire, conclusion, et votre résumé d'origine en annexe.

## Bon à savoir

- Claude rédige à partir de votre résumé et de connaissances générales, **sans recherche sur le web**. Les chiffres, dates et faits à contrôler sont listés dans « Points à vérifier ».
- **Mode démo** : mettez `MOCK=1` dans `.env` pour tester la mise en page sans clé ni coût (texte fictif).
- **Changer de modèle** : `ANTHROPIC_MODEL=...` dans `.env` (par défaut `claude-sonnet-5-5`).
- **Changer de port** : `PORT=8080` dans `.env`.
- Le serveur écoute uniquement sur votre machine (127.0.0.1) : il n'est pas visible depuis le réseau, et la clé reste côté serveur.

## Fichiers

- `server.js` : serveur local et appel à l'API Anthropic
- `public/index.html` : l'interface et la construction du PDF
- `.env.example` : modèle de configuration
- `Dockerfile`, `docker-compose.yml` : lancement en conteneur
