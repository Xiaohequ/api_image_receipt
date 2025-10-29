# Système de Traitement Asynchrone

Ce document décrit le système de traitement asynchrone implémenté pour l'API d'analyse de reçus.

## Vue d'ensemble

Le système utilise Bull/BullMQ avec Redis pour gérer le traitement asynchrone des images de reçus. Il comprend :

- **Queue Service** : Gestion de la file d'attente des tâches
- **Worker Service** : Traitement des tâches en arrière-plan
- **Status Service** : Suivi du statut et stockage des résultats

## Architecture

```
Client Request → API Gateway → Queue Service → Worker Service
                     ↓              ↓              ↓
                Status Service ← Redis Queue ← Processing Pipeline
```

## Endpoints API

### 1. Soumettre un reçu pour analyse
```http
POST /api/v1/receipts/analyze
Content-Type: multipart/form-data

{
  "image": <file>,
  "clientId": "client-123",
  "metadata": {
    "source": "mobile_app",
    "expectedType": "retail",
    "priority": "normal"
  }
}
```

**Réponse (202 Accepted):**
```json
{
  "success": true,
  "requestId": "uuid-123",
  "data": {
    "requestId": "uuid-123",
    "status": "pending",
    "estimatedProcessingTime": 30,
    "message": "Votre demande est en attente de traitement"
  },
  "processingTime": 0,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### 2. Vérifier le statut de traitement
```http
GET /api/v1/receipts/{requestId}/status
```

**Réponse (200 OK):**
```json
{
  "success": true,
  "requestId": "uuid-123",
  "data": {
    "requestId": "uuid-123",
    "status": "processing",
    "progress": 65,
    "estimatedTimeRemaining": 10,
    "message": "Analyse de votre reçu en cours..."
  },
  "processingTime": 0,
  "timestamp": "2024-01-01T12:00:30Z"
}
```

### 3. Récupérer les résultats
```http
GET /api/v1/receipts/{requestId}/result
```

**Réponse (200 OK) - Traitement terminé:**
```json
{
  "success": true,
  "requestId": "uuid-123",
  "data": {
    "requestId": "uuid-123",
    "status": "completed",
    "data": {
      "receiptType": "retail",
      "extractedFields": {
        "totalAmount": {
          "value": 25.99,
          "currency": "EUR",
          "confidence": 0.95
        },
        "date": {
          "value": "2024-01-01",
          "confidence": 0.90
        },
        "merchantName": {
          "value": "Super Marché",
          "confidence": 0.85
        },
        "items": [...],
        "summary": "Achat au Super Marché pour 25,99€"
      },
      "processingMetadata": {
        "processingTime": 28.5,
        "ocrConfidence": 0.88,
        "aiConfidence": 0.92,
        "imagePreprocessed": true,
        "detectedLanguage": "fr"
      },
      "extractedAt": "2024-01-01T12:01:00Z"
    },
    "createdAt": "2024-01-01T12:00:00Z",
    "completedAt": "2024-01-01T12:01:00Z"
  },
  "processingTime": 0,
  "timestamp": "2024-01-01T12:01:05Z"
}
```

**Réponse (202 Accepted) - Traitement en cours:**
```json
{
  "success": false,
  "error": {
    "code": "PROCESSING_ERROR",
    "message": "Le traitement est encore en cours. Veuillez vérifier le statut d'abord.",
    "timestamp": "2024-01-01T12:00:30Z"
  }
}
```

### 4. Statistiques de traitement (Admin)
```http
GET /api/v1/receipts/stats
```

**Réponse (200 OK):**
```json
{
  "success": true,
  "data": {
    "totalProcessed": 1250,
    "successRate": 94.5,
    "averageProcessingTime": 28.3,
    "queueLength": 5,
    "activeJobs": 2,
    "failedJobs": 1,
    "localStorage": {
      "total": 15,
      "completed": 12,
      "failed": 1,
      "pending": 1,
      "processing": 1
    },
    "queueHealth": {
      "status": "healthy",
      "queueLength": 5,
      "activeJobs": 2,
      "failedJobs": 1,
      "redisConnection": true
    }
  },
  "processingTime": 0,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## Statuts de traitement

| Statut | Description |
|--------|-------------|
| `pending` | Demande en attente de traitement |
| `processing` | Analyse en cours |
| `completed` | Traitement terminé avec succès |
| `failed` | Échec du traitement |

## Configuration

### Variables d'environnement
```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Processing Configuration
PROCESSING_TIMEOUT_MS=30000
QUEUE_CONCURRENCY=5
```

### Paramètres de la file d'attente
- **Concurrence** : 5 workers simultanés par défaut
- **Retry** : 3 tentatives avec backoff exponentiel
- **Timeout** : 30 secondes par tâche
- **Nettoyage** : Conservation des 100 derniers jobs réussis et 50 échecs

## Monitoring et Health Check

### Health Check étendu
```http
GET /health
```

Inclut maintenant :
- Statut de la connexion Redis
- Statut de la file d'attente
- Statut des workers
- Métriques de traitement

### Logs structurés
Le système génère des logs détaillés pour :
- Ajout de tâches à la file
- Début et fin de traitement
- Erreurs et échecs
- Métriques de performance

## Gestion des erreurs

### Codes d'erreur spécifiques
- `PROCESSING_ERROR` : Erreur générale de traitement
- `INVALID_REQUEST` : Requête non trouvée
- `SERVICE_UNAVAILABLE` : Service temporairement indisponible

### Stratégie de retry
- 3 tentatives automatiques
- Backoff exponentiel (2s, 4s, 8s)
- Nettoyage automatique des tâches échouées

## Utilisation

### Démarrage des services
Les services sont automatiquement initialisés au démarrage de l'application :

```typescript
// Dans src/index.ts
await queueService.initialize();
await workerService.initialize();
```

### Arrêt gracieux
L'application gère l'arrêt gracieux des services :

```typescript
// Arrêt des workers et fermeture des connexions Redis
await workerService.shutdown();
await queueService.close();
```

## Performance

### Métriques typiques
- **Temps de traitement moyen** : 25-35 secondes
- **Taux de succès** : >95% pour des images de qualité correcte
- **Débit** : 5 images simultanées par défaut
- **Latence** : <1 seconde pour les opérations de statut

### Optimisations
- Cache Redis pour les résultats fréquents
- Nettoyage automatique des anciens jobs
- Compression des données en transit
- Parallélisation du traitement OCR/AI

## Sécurité

- Validation des inputs
- Rate limiting par client
- Nettoyage automatique des fichiers temporaires
- Logs d'audit pour toutes les opérations