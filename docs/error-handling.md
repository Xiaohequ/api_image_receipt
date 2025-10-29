# Gestion d'Erreurs - API d'Analyse de Reçus

## Vue d'ensemble

Le système de gestion d'erreurs de l'API d'Analyse de Reçus fournit une approche standardisée et robuste pour traiter, enregistrer et communiquer les erreurs aux clients. Il inclut des messages d'erreur en français, un logging détaillé pour le debugging, et des codes de statut HTTP appropriés.

## Architecture de Gestion d'Erreurs

### Classes d'Erreur Personnalisées

#### AppError (Classe de Base)
```typescript
class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, any>;
  public readonly timestamp: Date;
  public readonly requestId?: string;
}
```

#### Classes Spécialisées
- **ValidationAppError** : Erreurs de validation des données
- **ProcessingError** : Erreurs de traitement d'images/OCR
- **ImageQualityError** : Erreurs liées à la qualité d'image
- **FileValidationError** : Erreurs de validation de fichiers
- **RateLimitError** : Erreurs de limite de taux
- **ServiceError** : Erreurs de services externes
- **AuthenticationError** : Erreurs d'authentification

### Codes d'Erreur Standardisés

| Code | Status HTTP | Description | Message Français |
|------|-------------|-------------|------------------|
| `INVALID_FORMAT` | 400 | Format de fichier non supporté | Format d'image non supporté |
| `FILE_TOO_LARGE` | 400 | Fichier trop volumineux | Taille de fichier dépassée |
| `POOR_IMAGE_QUALITY` | 422 | Qualité d'image insuffisante | Qualité d'image insuffisante pour l'analyse |
| `NO_TEXT_DETECTED` | 422 | Aucun texte détecté | Aucun texte détecté dans l'image |
| `RATE_LIMIT_EXCEEDED` | 429 | Limite de requêtes dépassée | Limite de requêtes dépassée |
| `PROCESSING_ERROR` | 500 | Erreur de traitement | Erreur interne de traitement |
| `SERVICE_UNAVAILABLE` | 503 | Service indisponible | Service temporairement indisponible |
| `UNAUTHORIZED` | 401 | Accès non autorisé | Accès non autorisé |
| `INVALID_REQUEST` | 400 | Requête invalide | Requête invalide |

## Middleware de Gestion d'Erreurs

### Fonctionnalités Principales

1. **Gestion Unifiée** : Traite tous les types d'erreurs (AppError, CustomError, erreurs JavaScript standard)
2. **Logging Enrichi** : Enregistre les détails complets pour le debugging
3. **Sanitisation** : Masque les informations sensibles dans les logs
4. **Messages Localisés** : Fournit des messages d'erreur en français
5. **ID de Requête** : Génère ou utilise des IDs de requête pour le traçage

### Format de Réponse Standardisé

```json
{
  "success": false,
  "requestId": "req_1234567890_abc123",
  "error": {
    "code": "INVALID_FORMAT",
    "message": "Format d'image \"BMP\" non supporté. Formats acceptés: JPEG, PNG, PDF",
    "details": {
      "receivedFormat": "BMP",
      "supportedFormats": ["JPEG", "PNG", "PDF"]
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Logging Avancé

### Configuration Winston

- **Niveaux de Log** : error, warn, info, debug
- **Formats** : JSON structuré pour les fichiers, format coloré pour la console
- **Rotation** : Fichiers de log avec rotation automatique (5MB max, 5 fichiers)
- **Séparation** : Logs d'erreur séparés, logs de debug en développement

### Types de Logs

1. **Logs d'Erreur** : Erreurs applicatives avec contexte complet
2. **Logs de Sécurité** : Tentatives d'authentification, dépassements de limite
3. **Logs de Performance** : Opérations lentes, problèmes de performance
4. **Logs de Validation** : Erreurs de validation des données

### Exemple de Log d'Erreur

```json
{
  "timestamp": "2024-01-15 10:30:00",
  "level": "error",
  "message": "Application Error Created",
  "service": "receipt-analyzer-api",
  "requestId": "req_1234567890_abc123",
  "errorCode": "INVALID_FORMAT",
  "details": {
    "receivedFormat": "BMP",
    "supportedFormats": ["JPEG", "PNG", "PDF"]
  },
  "clientInfo": {
    "ip": "192.168.1.100",
    "userAgent": "Mozilla/5.0...",
    "method": "POST",
    "url": "/api/v1/receipts/analyze"
  },
  "suggestion": "Convertissez votre image en JPEG, PNG ou PDF"
}
```

## Utilitaires d'Erreur

### Fonctions de Création d'Erreurs

```typescript
// Création d'erreurs avec logging automatique
const error = createAndLogError(
  ErrorCode.INVALID_FORMAT,
  'Invalid file format',
  req,
  { receivedFormat: 'BMP' }
);

// Gestion spécialisée par type d'erreur
const fileError = handleFileValidationError('BMP', req);
const sizeError = handleFileSizeError(15000000, 10000000, req);
const qualityError = handleImageQualityError(0.2, req);
```

### Messages Détaillés et Suggestions

```typescript
// Messages contextuels en français
const detailedMessage = getDetailedErrorMessage(ErrorCode.INVALID_FORMAT, {
  receivedFormat: 'BMP',
  supportedFormats: ['JPEG', 'PNG', 'PDF']
});

// Suggestions de récupération
const suggestions = getRecoveryActions(ErrorCode.INVALID_FORMAT);
// ["Convertir l'image en format JPEG, PNG ou PDF", ...]
```

## Intégration dans les Routes

### Utilisation avec Express

```typescript
router.post('/analyze', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Logique métier
    const result = await processReceipt(req.file);
    res.json({ success: true, data: result });
  } catch (error) {
    // L'erreur est automatiquement gérée par le middleware
    next(error);
  }
});
```

### Wrapper pour Fonctions Asynchrones

```typescript
import { asyncErrorHandler } from '../middleware/errorHandler';

router.get('/status/:id', asyncErrorHandler(async (req, res) => {
  const status = await getReceiptStatus(req.params.id);
  res.json({ success: true, data: status });
}));
```

## Gestion des Timeouts

### Middleware de Timeout

```typescript
import { timeoutHandler } from '../middleware/errorHandler';

// Timeout de 30 secondes pour les requêtes
app.use(timeoutHandler(30000));
```

## Monitoring et Alertes

### Métriques d'Erreur

- **Taux d'erreur par endpoint**
- **Patterns d'erreur par client**
- **Performance des services externes**
- **Erreurs de qualité d'image**

### Alertes Automatiques

- **Erreurs critiques** : Notification immédiate
- **Taux d'erreur élevé** : Alerte après seuil dépassé
- **Services indisponibles** : Monitoring continu

## Sécurité

### Sanitisation des Données

- **Headers sensibles** : Authorization, API keys masqués
- **Données utilisateur** : Mots de passe, tokens redacted
- **Informations système** : Stack traces filtrées en production

### Logging de Sécurité

```typescript
logSecurityEvent('Invalid file format attempted', {
  requestId,
  attemptedFormat: 'executable',
  clientInfo: extractClientInfo(req)
});
```

## Tests

### Tests Unitaires

```typescript
describe('Error Handler', () => {
  it('should handle AppError with French messages', async () => {
    const response = await request(app)
      .get('/test/invalid-format')
      .expect(400);
    
    expect(response.body.error.message)
      .toContain('Format d\'image non supporté');
  });
});
```

### Tests d'Intégration

- **Pipeline complet d'erreur** : De la génération à la réponse
- **Logging vérifié** : Validation des logs générés
- **Formats de réponse** : Conformité aux spécifications

## Bonnes Pratiques

### Création d'Erreurs

1. **Utilisez les factory functions** pour la cohérence
2. **Incluez le contexte** (requestId, détails client)
3. **Fournissez des suggestions** de récupération
4. **Loggez immédiatement** les erreurs critiques

### Gestion des Erreurs

1. **Propagez avec next()** dans Express
2. **Ne masquez pas les erreurs** importantes
3. **Utilisez des codes d'erreur** standardisés
4. **Documentez les nouveaux types** d'erreur

### Performance

1. **Évitez les logs excessifs** en production
2. **Utilisez la rotation** des fichiers de log
3. **Monitorer la taille** des logs
4. **Archivez les anciens logs**

## Configuration

### Variables d'Environnement

```bash
# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log

# Error Handling
ERROR_STACK_TRACE=false  # En production
SANITIZE_ERRORS=true     # Masquer les détails sensibles
```

### Exemple de Configuration

```typescript
const errorConfig = {
  logLevel: process.env.LOG_LEVEL || 'info',
  includeStackTrace: process.env.NODE_ENV !== 'production',
  sanitizeErrors: process.env.SANITIZE_ERRORS === 'true',
  maxLogFileSize: '5MB',
  maxLogFiles: 5
};
```

## Dépannage

### Problèmes Courants

1. **Logs manquants** : Vérifier les permissions du dossier logs
2. **Messages non traduits** : Vérifier les codes d'erreur
3. **Stack traces exposées** : Configurer l'environnement de production
4. **Performance dégradée** : Optimiser le niveau de logging

### Debug

```typescript
// Activer les logs de debug
process.env.LOG_LEVEL = 'debug';

// Tracer les erreurs spécifiques
logger.debug('Error context', {
  errorCode,
  requestId,
  clientInfo,
  processingTime
});
```

Cette implémentation fournit une base solide pour la gestion d'erreurs robuste, le debugging efficace, et une expérience utilisateur cohérente avec des messages d'erreur clairs en français.