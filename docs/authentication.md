# Authentification par Clé API

Ce document décrit l'implémentation de l'authentification par clé API pour l'API d'Analyse de Reçus.

## Vue d'ensemble

L'authentification par clé API a été implémentée pour sécuriser les endpoints sensibles de l'API. Le système utilise des clés API statiques avec un contrôle d'accès basé sur les permissions.

## Fonctionnalités

### 1. Middleware d'Authentification

- **`authenticateApiKey`** : Valide la clé API et définit les informations du client
- **`requirePermission(permission)`** : Vérifie les permissions spécifiques
- **`requireAdmin`** : Restreint l'accès aux administrateurs uniquement
- **`optionalAuth`** : Authentification optionnelle (n'échoue pas si pas de clé)

### 2. Méthodes d'Authentification Supportées

1. **En-tête personnalisé** : `x-api-key: votre-cle-api`
2. **Authorization Bearer** : `Authorization: Bearer votre-cle-api`
3. **Paramètre de requête** : `?api_key=votre-cle-api`

### 3. Gestion des Permissions

Chaque clé API peut avoir les permissions suivantes :
- `analyze` : Soumettre des images pour analyse
- `status` : Vérifier le statut de traitement
- `result` : Récupérer les résultats d'analyse
- `admin` : Accès aux endpoints administratifs
- `stats` : Accès aux statistiques de traitement

## Configuration

### Variables d'Environnement

```bash
# En-tête pour la clé API (par défaut: x-api-key)
API_KEY_HEADER=x-api-key

# Clés API au format: clé:clientId:nom,clé2:clientId2:nom2
API_KEYS=prod-key-123:client-prod:Client Production,admin-key-456:admin-user:Administrateur
```

### Clé de Développement

En mode développement, une clé par défaut est automatiquement créée :
- **Clé** : `dev-api-key-12345`
- **Client ID** : `dev-client`
- **Permissions** : Toutes les permissions

## Utilisation

### Sécurisation des Routes

```typescript
import { authenticateApiKey, requirePermission, requireAdmin } from '../middleware/auth';

// Endpoint protégé avec permission spécifique
router.post('/analyze', 
  authenticateApiKey,
  requirePermission('analyze'),
  // ... autres middlewares
);

// Endpoint administrateur
router.get('/stats',
  authenticateApiKey,
  requireAdmin,
  // ... autres middlewares
);
```

### Gestion des Clés API

```typescript
import { apiKeyUtils } from '../middleware/auth';

// Ajouter une nouvelle clé
apiKeyUtils.addApiKey({
  key: 'nouvelle-cle-123',
  clientId: 'client-001',
  name: 'Nouveau Client',
  isActive: true,
  permissions: ['analyze', 'status', 'result']
});

// Désactiver une clé
apiKeyUtils.deactivateApiKey('ancienne-cle-123');

// Supprimer une clé
apiKeyUtils.removeApiKey('cle-a-supprimer');

// Lister toutes les clés (sans exposer les clés réelles)
const keys = apiKeyUtils.listApiKeys();
```

## Endpoints Sécurisés

| Endpoint | Authentification | Permission Requise |
|----------|------------------|-------------------|
| `POST /api/v1/receipts/analyze` | ✅ | `analyze` |
| `GET /api/v1/receipts/:id/status` | ✅ | `status` |
| `GET /api/v1/receipts/:id/result` | ✅ | `result` |
| `GET /api/v1/receipts/stats` | ✅ | `admin` |
| `GET /health` | ❌ | Aucune |

## Gestion des Erreurs

### Codes d'Erreur

- **401 UNAUTHORIZED** : Clé API manquante, invalide ou permissions insuffisantes

### Messages d'Erreur (en français)

- `"Clé API manquante. Veuillez fournir une clé API valide dans l'en-tête de requête."`
- `"Clé API invalide. Veuillez vérifier votre clé API et réessayer."`
- `"Permissions insuffisantes. L'accès à cette ressource nécessite la permission 'analyze'."`
- `"Accès administrateur requis pour cette ressource."`

### Détails d'Erreur

Les réponses d'erreur incluent des détails utiles :

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Clé API manquante. Veuillez fournir une clé API valide dans l'en-tête de requête.",
    "details": {
      "reason": "missing_api_key",
      "headerName": "x-api-key",
      "supportedMethods": ["header", "bearer_token", "query_parameter"]
    },
    "timestamp": "2024-01-15T10:30:00.000Z"
  },
  "processingTime": 5
}
```

## Sécurité

### Fonctionnalités de Sécurité

1. **Validation des clés** : Toutes les clés sont validées contre le store sécurisé
2. **Clés inactives** : Les clés désactivées sont automatiquement rejetées
3. **Contrôle des permissions** : Accès granulaire basé sur les permissions
4. **Logging de sécurité** : Tous les événements d'authentification sont loggés
5. **Masquage des clés** : Les clés sensibles sont masquées dans les logs

### Bonnes Pratiques

1. **Rotation des clés** : Changez régulièrement les clés API
2. **Permissions minimales** : N'accordez que les permissions nécessaires
3. **Monitoring** : Surveillez les tentatives d'authentification échouées
4. **HTTPS uniquement** : Utilisez toujours HTTPS en production
5. **Variables d'environnement** : Stockez les clés dans des variables d'environnement sécurisées

## Exemples d'Utilisation

### Requête avec Clé API

```bash
# Utilisation de l'en-tête personnalisé
curl -X POST "https://api.example.com/api/v1/receipts/analyze" \
  -H "x-api-key: votre-cle-api" \
  -H "Content-Type: multipart/form-data" \
  -F "image=@receipt.jpg"

# Utilisation du Bearer token
curl -X GET "https://api.example.com/api/v1/receipts/123/status" \
  -H "Authorization: Bearer votre-cle-api"

# Utilisation du paramètre de requête
curl -X GET "https://api.example.com/api/v1/receipts/123/result?api_key=votre-cle-api"
```

### Réponse d'Authentification Réussie

```json
{
  "success": true,
  "requestId": "req_123456789",
  "data": {
    "status": "processing",
    "estimatedTimeRemaining": 15
  },
  "processingTime": 120,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Tests

Le système d'authentification inclut des tests complets :

- Tests unitaires pour les utilitaires de clés API
- Tests d'intégration pour les middlewares
- Tests de sécurité pour les cas d'erreur
- Tests de performance pour la validation des clés

Pour exécuter les tests d'authentification :

```bash
npm test -- --testPathPattern=auth
```

## Migration et Déploiement

### Étapes de Déploiement

1. **Configurer les variables d'environnement** avec les clés API de production
2. **Tester l'authentification** avec les nouvelles clés
3. **Déployer le code** avec les middlewares d'authentification
4. **Vérifier les endpoints** sécurisés
5. **Monitorer les logs** d'authentification

### Compatibilité

L'authentification est rétrocompatible et peut être activée progressivement :
- Les endpoints publics restent accessibles
- L'authentification optionnelle permet une migration en douceur
- Les anciens clients peuvent continuer à fonctionner temporairement