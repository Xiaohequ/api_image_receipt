# Guide du Rate Limiter Redis

## Vue d'ensemble

Le rate limiter utilise Redis pour limiter le nombre de requêtes par client/IP de manière distribuée. Il est configuré pour fonctionner avec plusieurs instances de l'API.

## Configuration

### Variables d'environnement

```bash
# Redis (requis pour le rate limiter)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password_if_needed

# Rate Limiting
RATE_LIMIT_WINDOW_MS=3600000    # 1 heure en millisecondes
RATE_LIMIT_MAX_REQUESTS=100     # 100 requêtes par heure
RATE_LIMIT_WHITELIST=127.0.0.1,::1  # IPs exemptées
```

### Limites configurées

- **API générale** : 100 requêtes/heure par client
- **Analyse de reçus** : 20 requêtes/heure par client (plus strict)
- **Health check** : 60 requêtes/minute par client

## Fonctionnement

### Identification des clients

1. **Client authentifié** : Utilise `req.clientId` si disponible
2. **Client anonyme** : Utilise l'adresse IP

### Clés Redis

- Format : `{prefix}:{type}:{identifier}`
- Exemples :
  - `api_rate_limit:client:user123`
  - `api_rate_limit:ip:192.168.1.100`
  - `analysis_rate_limit:client:user123`

### Headers de réponse

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Endpoints

### Vérifier le statut du rate limiter

```bash
GET /api/v1/rate-limit/status
```

Réponse :
```json
{
  "success": true,
  "data": {
    "limit": 100,
    "remaining": 95,
    "resetTime": "2024-01-01T12:00:00.000Z",
    "used": 5
  },
  "timestamp": "2024-01-01T11:30:00.000Z"
}
```

## Test du Rate Limiter

### Test automatique

```bash
node test-rate-limiter.js
```

Ce script :
1. Vérifie le statut initial
2. Envoie 25 requêtes (dépasse la limite de 20 pour l'analyse)
3. Affiche les résultats et valide le fonctionnement

### Test manuel

```bash
# Vérifier le statut
curl http://localhost:3000/api/v1/rate-limit/status

# Faire plusieurs requêtes pour tester la limite
for i in {1..25}; do
  echo "Requête $i:"
  curl -X POST http://localhost:3000/api/v1/test-analyze \
    -H "Content-Type: application/json" \
    -H "X-Client-ID: test-client" \
    -d '{"test": true}' \
    -w "Status: %{http_code}\n" \
    -s | head -1
  sleep 0.1
done
```

## Réponses d'erreur

### Rate limit dépassé (429)

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Limite de requêtes dépassée. Maximum 100 requêtes par heure autorisées.",
    "details": {
      "limit": 100,
      "windowMs": 3600000,
      "resetTime": "2024-01-01T12:00:00.000Z",
      "clientId": "user123",
      "retryAfter": 3600
    },
    "timestamp": "2024-01-01T11:30:00.000Z"
  },
  "timestamp": "2024-01-01T11:30:00.000Z"
}
```

## Administration

### Réinitialiser la limite d'un client

```typescript
import { resetRateLimit } from './src/middleware/rateLimiter';

// Réinitialiser pour un client spécifique
await resetRateLimit('user123', 'api_rate_limit');
```

### Surveillance

```typescript
import { getRateLimitStatus } from './src/middleware/rateLimiter';

// Obtenir le statut pour une requête
const status = await getRateLimitStatus(req);
console.log(`Client ${req.clientId}: ${status.used}/${status.limit} requêtes utilisées`);
```

## Dépannage

### Redis non disponible

Si Redis n'est pas disponible :
- Les requêtes continuent de fonctionner (pas de rate limiting)
- Des logs d'erreur sont générés
- En production, l'application peut s'arrêter selon la configuration

### Vérifier la connexion Redis

```bash
# Tester la connexion Redis
redis-cli -h localhost -p 6379 ping

# Voir les clés de rate limiting
redis-cli -h localhost -p 6379 keys "*rate_limit*"

# Voir la valeur d'une clé
redis-cli -h localhost -p 6379 get "api_rate_limit:client:user123"
```

### Logs utiles

```bash
# Voir les logs de rate limiting
grep "Rate limit" logs/app.log

# Voir les erreurs Redis
grep "Redis" logs/app.log
```

## Bonnes pratiques

1. **Monitoring** : Surveillez les métriques Redis et les taux de rate limiting
2. **Alertes** : Configurez des alertes pour les pics de trafic
3. **Whitelist** : Ajoutez les IPs de confiance à la whitelist
4. **Limites adaptées** : Ajustez les limites selon votre infrastructure
5. **Fallback** : Prévoyez un fallback si Redis est indisponible

## Métriques recommandées

- Nombre de requêtes rate limitées par heure
- Temps de réponse Redis
- Utilisation mémoire Redis
- Taux d'erreur des requêtes rate limitées
- Distribution des clients par utilisation