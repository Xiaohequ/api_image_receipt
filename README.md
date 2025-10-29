# Receipt Analyzer API

API backend pour analyser automatiquement les images de reçus et extraire les informations clés.

## Fonctionnalités

- Analyse OCR des images de reçus
- Extraction automatique des montants, dates, et noms de magasins
- Support des formats JPEG, PNG, PDF
- Traitement asynchrone avec système de queue
- API REST sécurisée avec rate limiting
- Cache Redis pour les performances

## Installation Rapide

### Avec Docker (Recommandé)

```bash
# 1. Cloner le repository
git clone <repository-url>
cd receipt-analyzer-api

# 2. Démarrer avec Docker
docker-compose up -d

# 3. Vérifier l'installation
curl http://localhost:3000/health
```

### Installation Manuelle

```bash
# 1. Cloner le repository
git clone <repository-url>
cd receipt-analyzer-api

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement
cp .env.example .env
# Éditer le fichier .env avec vos configurations

# 4. Créer les dossiers nécessaires
mkdir -p uploads logs temp/uploads

# 5. Démarrer les services requis (MongoDB, Redis)

# 6. Lancer l'application
npm run dev
```

Pour une installation détaillée, consultez [INSTALLATION.md](INSTALLATION.md)

## Scripts disponibles

- `npm run dev` - Démarrer en mode développement avec hot reload
- `npm run build` - Compiler le TypeScript
- `npm start` - Démarrer l'application compilée
- `npm test` - Lancer les tests
- `npm run lint` - Vérifier le code avec ESLint

## Structure du projet

```
src/
├── config/          # Configuration de l'application
├── controllers/     # Contrôleurs des routes API
├── middleware/      # Middleware personnalisés
├── models/          # Modèles de données
├── routes/          # Définitions des routes
├── services/        # Logique métier
└── utils/           # Utilitaires et helpers
```

## API Endpoints

- `GET /health` - Health check
- `POST /api/v1/receipts/analyze` - Analyser une image de reçu
- `GET /api/v1/receipts/{id}/status` - Vérifier le statut du traitement
- `GET /api/v1/receipts/{id}/result` - Récupérer les résultats

## Déploiement

### Développement avec Docker

```bash
# Démarrer l'environnement de développement
docker-compose up -d

# Voir les logs
docker-compose logs -f

# Arrêter
docker-compose down
```

### Production

```bash
# Configuration de production
./scripts/setup-env.sh production

# Démarrage en production
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Scripts de Démarrage

**Linux/macOS:**
- `./scripts/start-dev.sh` - Développement
- `./scripts/start.sh` - Production
- `./scripts/start-docker.sh` - Gestion Docker

**Windows:**
- `scripts\start-dev.bat` - Développement
- `scripts\start.bat` - Production
- `scripts\start-docker.bat` - Gestion Docker

Pour plus de détails, consultez [DEPLOYMENT.md](DEPLOYMENT.md)

## Documentation

- [Guide d'Installation](INSTALLATION.md) - Installation détaillée
- [Guide de Déploiement](DEPLOYMENT.md) - Déploiement et configuration
- [Documentation API](docs/) - Documentation technique

## Technologies utilisées

- Node.js + TypeScript
- Express.js
- Tesseract.js (OCR)
- Sharp (traitement d'images)
- MongoDB (base de données)
- Redis (cache et queue)
- Bull (gestion des queues)
- Winston (logging)
- Docker & Docker Compose