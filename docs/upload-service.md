# Service d'Upload et Validation d'Images

## Vue d'ensemble

Le service d'upload gère la réception, validation et stockage temporaire des images de reçus soumises par les clients. Il implémente les exigences de sécurité et de validation définies dans les spécifications.

## Fonctionnalités Implémentées

### 1. Middleware Multer pour Upload de Fichiers

- **Stockage en mémoire** : Les fichiers sont traités en mémoire pour des performances optimales
- **Limitation à un fichier** : Seul un fichier par requête est accepté
- **Validation du type MIME** : Vérification stricte des types de fichiers supportés

### 2. Validation des Formats d'Image

Formats supportés :
- **JPEG** (image/jpeg) - Extensions : .jpg, .jpeg
- **PNG** (image/png) - Extension : .png  
- **PDF** (application/pdf) - Extension : .pdf

### 3. Vérification de Taille de Fichier

- **Taille maximale** : 10MB par fichier
- **Validation côté middleware** : Rejet immédiat des fichiers trop volumineux
- **Messages d'erreur détaillés** : Information précise sur la taille reçue vs. limite

### 4. Génération d'IDs Uniques

- **UUID v4** : Identifiants uniques pour chaque requête de traitement
- **Traçabilité complète** : Chaque fichier est associé à un ID de requête unique
- **Logging structuré** : Tous les événements sont tracés avec l'ID de requête

## Architecture

### Middleware Upload (`src/middleware/upload.ts`)

```typescript
// Configuration multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1
  },
  fileFilter: validateFileType
});

// Middleware principal
export const uploadReceiptImage = upload.single('image');
export const processUploadedFile = async (req, res, next) => {
  // Validation et traitement du fichier
  // Génération des métadonnées
  // Attachement des données à la requête
};
```

### Service Upload (`src/services/uploadService.ts`)

```typescript
export class UploadService {
  // Sauvegarde temporaire des fichiers
  async saveUploadedFile(requestId, buffer, metadata, clientId)
  
  // Création des demandes d'analyse
  async createAnalysisRequest(requestId, filePath, metadata, clientId)
  
  // Nettoyage automatique des fichiers anciens
  private async cleanupOldFiles()
}
```

## Utilisation

### Endpoint d'Upload

```http
POST /api/v1/receipts/analyze
Content-Type: multipart/form-data

{
  "image": [fichier image],
  "clientId": "uuid-optionnel",
  "metadata": {
    "source": "mobile_app",
    "expectedType": "retail"
  }
}
```

### Réponse Succès

```json
{
  "success": true,
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "estimatedProcessingTime": 30,
    "message": "Image reçue et en cours de traitement"
  },
  "processingTime": 0,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Gestion d'Erreurs

#### Format Non Supporté (400)
```json
{
  "success": false,
  "error": {
    "code": "INVALID_FORMAT",
    "message": "Format d'image non supporté: text/plain. Formats acceptés: JPEG, PNG, PDF",
    "details": {
      "receivedMimeType": "text/plain",
      "supportedMimeTypes": ["image/jpeg", "image/png", "application/pdf"]
    }
  }
}
```

#### Fichier Trop Volumineux (400)
```json
{
  "success": false,
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "Taille de fichier trop importante: 12.5MB. Taille maximale autorisée: 10MB",
    "details": {
      "receivedSize": 13107200,
      "maxSize": 10485760,
      "receivedSizeMB": "12.50",
      "maxSizeMB": 10
    }
  }
}
```

#### Image Corrompue (422)
```json
{
  "success": false,
  "error": {
    "code": "POOR_IMAGE_QUALITY",
    "message": "Image corrompue ou format invalide. Impossible d'extraire les métadonnées.",
    "details": {
      "filename": "receipt.jpg",
      "mimeType": "image/jpeg",
      "size": 1024000
    }
  }
}
```

## Stockage Temporaire

### Structure des Fichiers

```
temp/uploads/
├── {requestId}.jpg          # Fichier image original
├── {requestId}.meta.json    # Métadonnées du fichier
└── {requestId}.request.json # Demande d'analyse
```

### Nettoyage Automatique

- **Rétention** : 24 heures maximum
- **Fréquence de nettoyage** : Toutes les heures
- **Logging** : Traçage des opérations de nettoyage

## Sécurité

### Validation Stricte

- **Extension vs MIME type** : Vérification de cohérence
- **Signatures de fichiers** : Validation des en-têtes de fichiers
- **Sanitisation** : Nettoyage des noms de fichiers

### Limitations

- **Rate limiting** : Intégré au niveau API
- **Taille mémoire** : Limitation pour éviter les attaques DoS
- **Types de fichiers** : Liste blanche stricte

## Tests

### Tests Unitaires

```bash
# Tests du service d'upload
npm test -- upload.test.ts

# Tests d'intégration
npm test -- upload-integration.test.ts
```

### Cas de Test Couverts

- ✅ Validation des formats supportés
- ✅ Rejet des formats non supportés  
- ✅ Validation de taille de fichier
- ✅ Génération d'IDs uniques
- ✅ Extraction de métadonnées d'image
- ✅ Gestion des erreurs multer
- ✅ Stockage temporaire
- ✅ Nettoyage automatique

## Configuration

### Variables d'Environnement

```env
# Répertoire de stockage temporaire
TEMP_UPLOAD_DIR=./temp/uploads

# Durée de rétention (heures)
UPLOAD_RETENTION_HOURS=24

# Intervalle de nettoyage (minutes)  
CLEANUP_INTERVAL_MINUTES=60
```

## Monitoring

### Métriques Loggées

- Nombre de fichiers uploadés
- Taille moyenne des fichiers
- Taux d'erreur par type
- Temps de traitement des uploads
- Opérations de nettoyage

### Alertes Recommandées

- Espace disque faible
- Taux d'erreur élevé
- Fichiers non nettoyés
- Temps de traitement anormal