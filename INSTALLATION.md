# Guide d'Installation - API d'Analyse de Reçus

Ce guide vous accompagne dans l'installation et la configuration de l'API d'Analyse de Reçus sur différents systèmes d'exploitation.

## Table des Matières

1. [Installation Rapide](#installation-rapide)
2. [Installation Détaillée](#installation-détaillée)
3. [Configuration](#configuration)
4. [Vérification](#vérification)
5. [Dépannage](#dépannage)

## Installation Rapide

### Avec Docker (Recommandé)

```bash
# 1. Cloner le repository
git clone <repository-url>
cd receipt-analyzer-api

# 2. Configurer l'environnement
cp .env.example .env

# 3. Démarrer avec Docker
docker-compose up -d

# 4. Vérifier l'installation
curl http://localhost:3000/health
```

### Sans Docker

```bash
# 1. Cloner le repository
git clone <repository-url>
cd receipt-analyzer-api

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement
cp .env.example .env

# 4. Démarrer les services requis (MongoDB, Redis)
# Voir la section "Services Requis" ci-dessous

# 5. Démarrer l'application
npm run dev
```

## Installation Détaillée

### Prérequis Système

#### Node.js et npm

**Windows:**
1. Télécharger Node.js depuis [nodejs.org](https://nodejs.org/)
2. Installer la version LTS (18.x ou supérieure)
3. Vérifier l'installation :
   ```cmd
   node --version
   npm --version
   ```

**macOS:**
```bash
# Avec Homebrew
brew install node

# Ou télécharger depuis nodejs.org
```

**Linux (Ubuntu/Debian):**
```bash
# Installer Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Vérifier l'installation
node --version
npm --version
```

#### Docker (Optionnel mais Recommandé)

**Windows:**
1. Télécharger Docker Desktop depuis [docker.com](https://www.docker.com/products/docker-desktop)
2. Installer et redémarrer
3. Vérifier : `docker --version`

**macOS:**
```bash
# Avec Homebrew
brew install --cask docker

# Ou télécharger Docker Desktop
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install docker.io docker-compose
sudo systemctl start docker
sudo systemctl enable docker

# Ajouter l'utilisateur au groupe docker
sudo usermod -aG docker $USER
```

### Services Requis (Installation Locale)

#### MongoDB

**Windows:**
1. Télécharger MongoDB Community Server depuis [mongodb.com](https://www.mongodb.com/try/download/community)
2. Installer avec les options par défaut
3. Démarrer le service MongoDB

**macOS:**
```bash
# Avec Homebrew
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb/brew/mongodb-community
```

**Linux:**
```bash
# Ubuntu/Debian
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

#### Redis

**Windows:**
1. Télécharger Redis depuis [redis.io](https://redis.io/download) ou utiliser WSL
2. Ou utiliser Docker : `docker run -d -p 6379:6379 redis:alpine`

**macOS:**
```bash
# Avec Homebrew
brew install redis
brew services start redis
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

#### Tesseract OCR

**Windows:**
1. Télécharger depuis [github.com/UB-Mannheim/tesseract](https://github.com/UB-Mannheim/tesseract/wiki)
2. Installer avec les packs de langue français et anglais
3. Ajouter au PATH système

**macOS:**
```bash
# Avec Homebrew
brew install tesseract
brew install tesseract-lang
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt-get install tesseract-ocr tesseract-ocr-fra tesseract-ocr-eng
```

### Installation de l'Application

#### 1. Cloner le Repository

```bash
git clone <repository-url>
cd receipt-analyzer-api
```

#### 2. Installer les Dépendances

```bash
# Installation des dépendances
npm install

# Vérifier l'installation
npm list --depth=0
```

#### 3. Configuration de l'Environnement

##### Option A: Configuration Automatique

**Linux/macOS:**
```bash
# Développement
./scripts/setup-env.sh development

# Production
./scripts/setup-env.sh production
```

**Windows:**
```cmd
REM Copier manuellement le fichier d'exemple
copy .env.example .env
```

##### Option B: Configuration Manuelle

```bash
# Copier le fichier d'exemple
cp .env.example .env

# Éditer avec vos paramètres
nano .env  # ou votre éditeur préféré
```

#### 4. Configuration de Base de Données

```bash
# Se connecter à MongoDB
mongosh

# Créer la base de données et l'utilisateur
use receipt_analyzer
db.createUser({
  user: "receipt_user",
  pwd: "secure_password",
  roles: [{ role: "readWrite", db: "receipt_analyzer" }]
})
```

#### 5. Créer les Dossiers Nécessaires

```bash
# Créer les dossiers de travail
mkdir -p uploads logs temp/uploads

# Définir les permissions (Linux/macOS)
chmod 755 uploads logs temp
```

### Démarrage de l'Application

#### Développement

**Linux/macOS:**
```bash
# Avec script
./scripts/start-dev.sh

# Ou manuellement
npm run dev
```

**Windows:**
```cmd
REM Avec script batch
scripts\start-dev.bat

REM Ou manuellement
npm run dev
```

#### Production

**Linux/macOS:**
```bash
# Avec script
./scripts/start.sh

# Ou manuellement
npm run build
npm start
```

**Windows:**
```cmd
REM Avec script batch
scripts\start.bat

REM Ou manuellement
npm run build
npm start
```

#### Avec Docker

```bash
# Développement
docker-compose up -d

# Production
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Avec scripts (Linux/macOS)
./scripts/start-docker.sh development up
./scripts/start-docker.sh production up

# Avec scripts (Windows)
scripts\start-docker.bat development up
scripts\start-docker.bat production up
```

## Configuration

### Variables d'Environnement Essentielles

Modifiez le fichier `.env` avec vos paramètres :

```bash
# Configuration du serveur
NODE_ENV=development
PORT=3000

# Base de données MongoDB
MONGODB_URI=mongodb://localhost:27017/receipt-analyzer
DB_NAME=receipt_analyzer

# Cache Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Sécurité
JWT_SECRET=your-jwt-secret-key
API_KEYS=your-api-key:client-id:Client Name

# Traitement d'images
MAX_FILE_SIZE=10485760
ALLOWED_FORMATS=jpeg,jpg,png,pdf
TESSERACT_LANG=fra+eng

# Rate Limiting
RATE_LIMIT_WINDOW_MS=3600000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log
```

### Configuration Avancée

#### CORS (Cross-Origin Resource Sharing)

```bash
# Autoriser des domaines spécifiques
CORS_ORIGIN=http://localhost:3000,https://yourdomain.com
CORS_CREDENTIALS=true
```

#### Sécurité

```bash
# Clés API multiples (séparées par des virgules)
API_KEYS=key1:client1:Client 1,key2:client2:Client 2

# Whitelist d'IPs pour le rate limiting
RATE_LIMIT_WHITELIST=127.0.0.1,::1,192.168.1.100

# Sanitisation des entrées
ENABLE_INPUT_SANITIZATION=true
```

#### Performance

```bash
# Configuration de la queue de traitement
QUEUE_CONCURRENCY=5
PROCESSING_TIMEOUT_MS=30000

# Configuration du cache
CACHE_DEFAULT_TTL=3600
CACHE_STATUS_TTL=30
CACHE_RESULT_TTL=3600
```

## Vérification

### Tests de Santé

```bash
# Test de base
curl http://localhost:3000/health

# Réponse attendue
{
  "status": "healthy",
  "timestamp": "2023-12-01T10:00:00.000Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "ocr": "available"
  }
}
```

### Test d'Analyse

```bash
# Test avec une image (remplacez par votre clé API)
curl -X POST \
  -H "x-api-key: your-api-key" \
  -F "image=@test-receipt.jpg" \
  http://localhost:3000/api/v1/receipts/analyze

# Réponse attendue
{
  "success": true,
  "requestId": "uuid-here",
  "status": "processing",
  "estimatedProcessingTime": 15
}
```

### Vérification des Services

#### MongoDB

```bash
# Test de connexion
mongosh --eval "db.adminCommand('ping')"

# Vérifier les collections
mongosh receipt_analyzer --eval "show collections"
```

#### Redis

```bash
# Test de connexion
redis-cli ping

# Vérifier les clés
redis-cli keys "*"
```

### Logs de Démarrage

Vérifiez les logs pour confirmer le démarrage :

```bash
# Logs de l'application
tail -f logs/app.log

# Avec Docker
docker-compose logs -f receipt-analyzer-api
```

## Dépannage

### Problèmes Courants

#### 1. Erreur "Cannot connect to MongoDB"

**Solution :**
```bash
# Vérifier que MongoDB est démarré
sudo systemctl status mongod  # Linux
brew services list | grep mongodb  # macOS

# Vérifier la configuration
mongosh --eval "db.adminCommand('ping')"

# Vérifier l'URI dans .env
MONGODB_URI=mongodb://localhost:27017/receipt-analyzer
```

#### 2. Erreur "Redis connection failed"

**Solution :**
```bash
# Vérifier que Redis est démarré
sudo systemctl status redis-server  # Linux
brew services list | grep redis  # macOS

# Tester la connexion
redis-cli ping

# Vérifier la configuration dans .env
REDIS_HOST=localhost
REDIS_PORT=6379
```

#### 3. Erreur "Tesseract not found"

**Solution :**
```bash
# Vérifier l'installation
tesseract --version

# Vérifier les langues disponibles
tesseract --list-langs

# Réinstaller si nécessaire (voir section installation)
```

#### 4. Erreur de permissions sur les dossiers

**Solution Linux/macOS :**
```bash
# Corriger les permissions
sudo chown -R $USER:$USER uploads logs temp
chmod -R 755 uploads logs temp
```

**Solution Windows :**
```cmd
REM Vérifier que les dossiers existent
dir uploads logs temp

REM Créer s'ils n'existent pas
mkdir uploads logs temp\uploads
```

#### 5. Port déjà utilisé

**Solution :**
```bash
# Trouver le processus utilisant le port 3000
lsof -i :3000  # Linux/macOS
netstat -ano | findstr :3000  # Windows

# Changer le port dans .env
PORT=3001
```

### Commandes de Diagnostic

```bash
# Vérifier la version de Node.js
node --version

# Vérifier les dépendances installées
npm list --depth=0

# Vérifier la configuration
npm run build  # Doit réussir sans erreur

# Tester les services externes
curl http://localhost:3000/health

# Vérifier les logs d'erreur
tail -f logs/app.log | grep ERROR
```

### Réinitialisation Complète

Si vous rencontrez des problèmes persistants :

```bash
# 1. Arrêter tous les services
docker-compose down  # Si utilisation de Docker
# Ou arrêter manuellement l'application

# 2. Nettoyer les dépendances
rm -rf node_modules package-lock.json
npm install

# 3. Nettoyer les données temporaires
rm -rf uploads/* logs/* temp/*

# 4. Reconfigurer l'environnement
cp .env.example .env
# Éditer .env avec vos paramètres

# 5. Redémarrer
npm run build
npm start
```

### Support

Si vous continuez à rencontrer des problèmes :

1. Vérifiez les logs détaillés dans `logs/app.log`
2. Consultez la documentation de déploiement (`DEPLOYMENT.md`)
3. Vérifiez que toutes les dépendances système sont installées
4. Assurez-vous que les ports requis (3000, 27017, 6379) sont disponibles

Pour un support technique, incluez :
- Version du système d'exploitation
- Version de Node.js (`node --version`)
- Logs d'erreur complets
- Configuration (sans les secrets)