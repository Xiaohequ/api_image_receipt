# Guide de Déploiement - API d'Analyse de Reçus

Ce document fournit des instructions complètes pour déployer l'API d'Analyse de Reçus dans différents environnements.

## Table des Matières

1. [Prérequis](#prérequis)
2. [Configuration de l'Environnement](#configuration-de-lenvironnement)
3. [Déploiement Local](#déploiement-local)
4. [Déploiement avec Docker](#déploiement-avec-docker)
5. [Déploiement en Production](#déploiement-en-production)
6. [Monitoring et Maintenance](#monitoring-et-maintenance)
7. [Dépannage](#dépannage)

## Prérequis

### Système Requis

- **Node.js**: Version 18.x ou supérieure
- **npm**: Version 8.x ou supérieure
- **Docker**: Version 20.x ou supérieure (pour le déploiement containerisé)
- **Docker Compose**: Version 2.x ou supérieure

### Services Externes

- **MongoDB**: Version 7.0 ou supérieure
- **Redis**: Version 7.0 ou supérieure
- **Tesseract OCR**: Pour le traitement d'images

### Ressources Système Recommandées

#### Développement
- **CPU**: 2 cores
- **RAM**: 4 GB
- **Stockage**: 10 GB

#### Production
- **CPU**: 4 cores
- **RAM**: 8 GB
- **Stockage**: 50 GB (avec espace pour les logs et uploads)

## Configuration de l'Environnement

### 1. Configuration Automatique

Utilisez le script de configuration pour générer automatiquement les fichiers d'environnement :

```bash
# Configuration pour le développement
./scripts/setup-env.sh development

# Configuration pour la production
./scripts/setup-env.sh production

# Configuration pour les tests
./scripts/setup-env.sh testing
```

### 2. Configuration Manuelle

Copiez le fichier d'exemple et modifiez selon vos besoins :

```bash
cp .env.example .env
```

#### Variables d'Environnement Essentielles

```bash
# Configuration du serveur
NODE_ENV=production
PORT=3000

# Base de données
MONGODB_URI=mongodb://localhost:27017/receipt-analyzer
DB_NAME=receipt_analyzer

# Cache Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# Sécurité
JWT_SECRET=your-super-secret-jwt-key
API_KEYS=your-api-key:client-id:client-name

# Traitement d'images
MAX_FILE_SIZE=10485760
ALLOWED_FORMATS=jpeg,jpg,png,pdf
PROCESSING_TIMEOUT_MS=30000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=3600000
RATE_LIMIT_MAX_REQUESTS=100
```

## Déploiement Local

### 1. Installation des Dépendances

```bash
# Cloner le repository
git clone <repository-url>
cd receipt-analyzer-api

# Installer les dépendances
npm install
```

### 2. Configuration de l'Environnement

```bash
# Configurer l'environnement de développement
./scripts/setup-env.sh development
```

### 3. Démarrage des Services

#### Option A: Services Locaux

Assurez-vous que MongoDB et Redis sont installés et démarrés localement :

```bash
# Démarrer MongoDB (exemple Ubuntu/Debian)
sudo systemctl start mongod

# Démarrer Redis
sudo systemctl start redis-server

# Démarrer l'application
./scripts/start-dev.sh
```

#### Option B: Services Docker

```bash
# Démarrer uniquement les services de base de données
docker-compose up -d mongodb redis

# Démarrer l'application en mode développement
npm run dev
```

### 4. Vérification

L'API sera disponible à `http://localhost:3000`

```bash
# Test de santé
curl http://localhost:3000/health

# Test avec une clé API
curl -H "x-api-key: your-dev-api-key" http://localhost:3000/api/v1/receipts/analyze
```

## Déploiement avec Docker

### 1. Déploiement de Développement

```bash
# Démarrer l'environnement complet de développement
./scripts/start-docker.sh development up

# Ou manuellement
docker-compose up -d
```

#### Services Disponibles

- **API**: http://localhost:3000
- **MongoDB**: localhost:27017
- **Redis**: localhost:6379
- **Redis Commander**: http://localhost:8081 (avec profil tools)
- **Mongo Express**: http://localhost:8082 (avec profil tools)

#### Démarrer avec les outils de développement

```bash
# Inclure les outils de gestion de base de données
docker-compose --profile tools up -d
```

### 2. Gestion des Conteneurs

```bash
# Voir les logs
./scripts/start-docker.sh development logs

# Arrêter les conteneurs
./scripts/start-docker.sh development down

# Redémarrer
./scripts/start-docker.sh development restart

# Voir le statut
./scripts/start-docker.sh development status

# Nettoyage complet
./scripts/start-docker.sh development clean
```

## Déploiement en Production

### 1. Préparation de l'Environnement

```bash
# Configurer l'environnement de production
./scripts/setup-env.sh production

# Éditer le fichier .env.production avec vos valeurs
nano .env.production
```

### 2. Configuration de Production

Créez un fichier `.env.production` avec les valeurs de production :

```bash
NODE_ENV=production
PORT=3000

# Base de données sécurisée
MONGODB_URI=mongodb://admin:secure-password@mongodb:27017/receipt-analyzer?authSource=admin
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=secure-mongodb-password

# Redis sécurisé
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=secure-redis-password

# Clés de sécurité fortes
JWT_SECRET=very-long-and-secure-jwt-secret-key
API_KEYS=prod-api-key-1:client-1:Production Client 1,prod-api-key-2:client-2:Production Client 2

# Logging de production
LOG_LEVEL=warn
LOG_SENSITIVE_DATA=false

# Performance
QUEUE_CONCURRENCY=10
CACHE_DEFAULT_TTL=7200
```

### 3. Déploiement avec Docker

```bash
# Démarrer l'environnement de production
./scripts/start-docker.sh production up

# Ou manuellement
docker-compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production up -d
```

### 4. Configuration Nginx (Optionnel)

Créez le fichier de configuration Nginx :

```bash
mkdir -p nginx
```

Créez `nginx/nginx.conf` :

```nginx
events {
    worker_connections 1024;
}

http {
    upstream receipt_analyzer_api {
        server receipt-analyzer-api:3000;
    }

    server {
        listen 80;
        server_name your-domain.com;

        # Redirection HTTPS
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        # Certificats SSL
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;

        # Configuration SSL
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
        ssl_prefer_server_ciphers off;

        # Limites de taille de fichier
        client_max_body_size 10M;

        # Proxy vers l'API
        location / {
            proxy_pass http://receipt_analyzer_api;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Health check
        location /health {
            proxy_pass http://receipt_analyzer_api/health;
            access_log off;
        }
    }
}
```

### 5. Sauvegarde et Restauration

#### Sauvegarde MongoDB

```bash
# Créer une sauvegarde
docker exec receipt-analyzer-mongodb-prod mongodump --out /backup --authenticationDatabase admin -u admin -p your-password

# Copier la sauvegarde vers l'hôte
docker cp receipt-analyzer-mongodb-prod:/backup ./backup-$(date +%Y%m%d)
```

#### Restauration MongoDB

```bash
# Copier la sauvegarde vers le conteneur
docker cp ./backup-20231201 receipt-analyzer-mongodb-prod:/restore

# Restaurer
docker exec receipt-analyzer-mongodb-prod mongorestore /restore --authenticationDatabase admin -u admin -p your-password
```

## Monitoring et Maintenance

### 1. Health Checks

L'API fournit plusieurs endpoints de monitoring :

```bash
# Santé générale
curl http://localhost:3000/health

# Métriques détaillées (si implémentées)
curl http://localhost:3000/metrics
```

### 2. Logs

#### Consultation des Logs

```bash
# Logs de l'application
docker-compose logs -f receipt-analyzer-api

# Logs de tous les services
docker-compose logs -f

# Logs avec horodatage
docker-compose logs -f -t
```

#### Rotation des Logs

Configurez la rotation des logs dans Docker Compose :

```yaml
services:
  receipt-analyzer-api:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### 3. Monitoring des Performances

#### Métriques Système

```bash
# Utilisation des ressources
docker stats

# Espace disque
df -h

# Mémoire
free -h
```

#### Métriques de l'Application

Surveillez ces métriques clés :

- Temps de réponse des endpoints
- Taux de succès/échec des analyses
- Utilisation de la queue Redis
- Connexions à la base de données
- Utilisation du cache

### 4. Mise à Jour

#### Mise à Jour de l'Application

```bash
# Arrêter les services
docker-compose down

# Mettre à jour le code
git pull origin main

# Reconstruire les images
docker-compose build

# Redémarrer
docker-compose up -d
```

#### Mise à Jour des Dépendances

```bash
# Mettre à jour package.json
npm update

# Reconstruire l'image Docker
docker-compose build receipt-analyzer-api
```

## Dépannage

### Problèmes Courants

#### 1. Erreur de Connexion à MongoDB

```bash
# Vérifier le statut de MongoDB
docker-compose ps mongodb

# Vérifier les logs
docker-compose logs mongodb

# Tester la connexion
docker exec -it receipt-analyzer-mongodb mongosh
```

#### 2. Erreur de Connexion à Redis

```bash
# Vérifier le statut de Redis
docker-compose ps redis

# Tester la connexion
docker exec -it receipt-analyzer-redis redis-cli ping
```

#### 3. Problèmes de Performance OCR

```bash
# Vérifier l'utilisation des ressources
docker stats receipt-analyzer-api

# Augmenter les ressources allouées
# Modifier docker-compose.yml :
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 2G
```

#### 4. Erreurs de Permissions de Fichiers

```bash
# Vérifier les permissions des dossiers
ls -la uploads/ logs/

# Corriger les permissions
sudo chown -R 1001:1001 uploads/ logs/
```

### Commandes de Diagnostic

```bash
# Vérifier la configuration
./scripts/setup-env.sh validate

# Tester l'API
curl -X POST -H "x-api-key: your-api-key" \
     -F "image=@test-receipt.jpg" \
     http://localhost:3000/api/v1/receipts/analyze

# Vérifier les processus
docker-compose top

# Vérifier l'utilisation du réseau
docker network ls
docker network inspect receipt-analyzer_receipt-analyzer-network
```

### Support et Logs

En cas de problème, collectez ces informations :

1. Version de l'application
2. Configuration de l'environnement (sans les secrets)
3. Logs de l'application
4. Logs des services (MongoDB, Redis)
5. Métriques système

```bash
# Script de collecte d'informations de diagnostic
echo "=== System Info ===" > diagnostic.log
docker --version >> diagnostic.log
docker-compose --version >> diagnostic.log
echo "=== Container Status ===" >> diagnostic.log
docker-compose ps >> diagnostic.log
echo "=== Application Logs ===" >> diagnostic.log
docker-compose logs --tail=100 receipt-analyzer-api >> diagnostic.log
echo "=== Database Logs ===" >> diagnostic.log
docker-compose logs --tail=50 mongodb >> diagnostic.log
echo "=== Redis Logs ===" >> diagnostic.log
docker-compose logs --tail=50 redis >> diagnostic.log
```

## Sécurité en Production

### 1. Bonnes Pratiques

- Utilisez des mots de passe forts pour toutes les bases de données
- Changez les clés JWT et API par défaut
- Activez HTTPS avec des certificats valides
- Configurez un pare-feu approprié
- Limitez l'accès aux ports de base de données
- Surveillez les logs pour détecter les activités suspectes

### 2. Variables d'Environnement Sensibles

Ne jamais commiter ces variables dans le code source :

- `JWT_SECRET`
- `API_KEYS`
- `MONGO_ROOT_PASSWORD`
- `REDIS_PASSWORD`

### 3. Mise à Jour de Sécurité

Maintenez à jour :

- Images Docker de base
- Dépendances Node.js
- Système d'exploitation hôte
- Certificats SSL

Ce guide couvre les aspects essentiels du déploiement. Pour des configurations spécifiques ou des environnements cloud, consultez la documentation de votre fournisseur d'infrastructure.