# Configuration OpenAI

## Vue d'ensemble

L'API utilise OpenAI pour l'analyse intelligente des reçus. La clé API est maintenant chargée **uniquement depuis le fichier .env** pour des raisons de sécurité.

## Configuration requise

### 1. Obtenir une clé API OpenAI

1. Visitez [OpenAI Platform](https://platform.openai.com/api-keys)
2. Connectez-vous ou créez un compte
3. Cliquez sur "Create new secret key"
4. Copiez la clé (elle commence par `sk-`)

### 2. Configurer le fichier .env

```bash
# Copiez le fichier d'exemple
cp .env.example .env

# Éditez .env et ajoutez votre clé API
OPENAI_API_KEY=sk-votre-clé-api-ici
```

### 3. Vérifier la configuration

```bash
# Vérifier la configuration OpenAI
npm run check:openai

# Vérifier toutes les dépendances
npm run check:all
```

## Variables d'environnement OpenAI

| Variable | Description | Valeur par défaut |
|----------|-------------|-------------------|
| `OPENAI_API_KEY` | Clé API OpenAI (obligatoire) | - |
| `OPENAI_MODEL` | Modèle à utiliser | `gpt-4o-mini` |
| `OPENAI_MAX_TOKENS` | Nombre max de tokens | `1000` |
| `OPENAI_TEMPERATURE` | Créativité (0-1) | `0.1` |

## Sécurité

### ✅ Bonnes pratiques
- ✅ Clé API dans `.env` uniquement
- ✅ `.env` dans `.gitignore`
- ✅ Utilisation de `.env.example` pour la documentation
- ✅ Pas de clé API dans `docker-compose.yml`

### ❌ À éviter
- ❌ Clé API dans le code source
- ❌ Clé API dans les fichiers de configuration versionnés
- ❌ Clé API dans les logs
- ❌ Partage de la clé API

## Docker Compose

Le fichier `docker-compose.yml` a été modifié pour charger les variables depuis `.env` :

```yaml
services:
  receipt-analyzer-api:
    env_file:
      - .env
    environment:
      # Autres variables...
      # OPENAI_API_KEY sera chargée depuis .env
```

## Dépannage

### Erreur : "OPENAI_API_KEY n'est pas définie"

```bash
# Vérifiez que le fichier .env existe
ls -la .env

# Vérifiez le contenu (sans afficher la clé)
grep "OPENAI_API_KEY" .env

# Testez la configuration
npm run check:openai
```

### Erreur : "Clé API invalide"

1. Vérifiez que la clé commence par `sk-`
2. Vérifiez qu'elle n'a pas d'espaces avant/après
3. Générez une nouvelle clé sur OpenAI Platform
4. Vérifiez que votre compte OpenAI a des crédits

### Erreur : "Modèle non disponible"

```bash
# Listez les modèles disponibles
npm run check:openai

# Modifiez OPENAI_MODEL dans .env si nécessaire
```

## Utilisation en développement

```bash
# Démarrage avec vérifications
npm run dev:with-redis

# Ou vérification manuelle
npm run check:all
npm run dev
```

## Utilisation en production

### Variables d'environnement recommandées

```bash
# Production
NODE_ENV=production
OPENAI_API_KEY=sk-votre-clé-production
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=1000
OPENAI_TEMPERATURE=0.1

# Pas de variables de développement
LOG_LEVEL=info
```

### Déploiement sécurisé

1. **Jamais** de clé API dans le code
2. Utiliser des secrets de déploiement (Kubernetes secrets, AWS Parameter Store, etc.)
3. Rotation régulière des clés API
4. Monitoring de l'utilisation OpenAI

## Monitoring

### Métriques recommandées
- Nombre de requêtes OpenAI par heure
- Coût des requêtes OpenAI
- Temps de réponse OpenAI
- Taux d'erreur OpenAI

### Logs utiles
```bash
# Voir les logs OpenAI
grep "OpenAI" logs/app.log

# Voir les erreurs d'initialisation
grep "Failed to initialize OpenAI" logs/app.log
```

## Coûts

### Estimation des coûts (gpt-4o-mini)
- ~$0.00015 par 1K tokens d'entrée
- ~$0.0006 par 1K tokens de sortie
- Analyse d'un reçu : ~500 tokens → ~$0.0003

### Optimisation
- Utiliser `gpt-4o-mini` (moins cher que GPT-4)
- Limiter `OPENAI_MAX_TOKENS`
- Cache des résultats pour éviter les re-analyses
- Rate limiting pour contrôler l'usage

## Support

### Ressources OpenAI
- [Documentation API](https://platform.openai.com/docs)
- [Gestion des clés](https://platform.openai.com/api-keys)
- [Facturation](https://platform.openai.com/account/billing)
- [Limites de taux](https://platform.openai.com/account/rate-limits)

### Scripts de diagnostic
```bash
npm run check:openai  # Vérification complète
node scripts/check-openai.js  # Script direct
```