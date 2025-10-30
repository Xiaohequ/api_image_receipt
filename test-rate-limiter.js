#!/usr/bin/env node

/**
 * Script de test pour vérifier le rate limiter Redis
 * Usage: node test-rate-limiter.js
 */

const http = require('http');

const API_BASE = 'http://localhost:3000';
const TEST_ENDPOINT = '/api/v1/test'; // Use the test endpoint which has rate limiting
const STATUS_ENDPOINT = '/rate-limit/status';

// Configuration du test
const TEST_CONFIG = {
  requests: 105, // Nombre de requêtes à envoyer (dépasse la limite de 100)
  interval: 50, // Intervalle entre les requêtes (ms)
  clientId: 'test-client-123'
};

/**
 * Faire une requête HTTP
 */
function makeRequest(path, method = 'POST', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-ID': TEST_CONFIG.clientId,
        'User-Agent': 'RateLimiterTest/1.0'
      }
    };

    if (data) {
      const jsonData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(jsonData);
    }

    const req = http.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = {
            status: res.statusCode,
            headers: res.headers,
            body: body ? JSON.parse(body) : null
          };
          resolve(result);
        } catch (error) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: body,
            parseError: error.message
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

/**
 * Vérifier le statut du rate limiter
 */
async function checkRateLimitStatus() {
  try {
    console.log('\n📊 Vérification du statut du rate limiter...');
    const response = await makeRequest(STATUS_ENDPOINT, 'GET');
    
    if (response.status === 200 && response.body.success) {
      const { limit, remaining, used, resetTime } = response.body.data;
      console.log(`   Limite: ${limit} requêtes/heure`);
      console.log(`   Utilisées: ${used}`);
      console.log(`   Restantes: ${remaining}`);
      console.log(`   Reset: ${new Date(resetTime).toLocaleTimeString()}`);
      return response.body.data;
    } else {
      console.log(`   ❌ Erreur: ${response.status} - ${JSON.stringify(response.body)}`);
      return null;
    }
  } catch (error) {
    console.log(`   ❌ Erreur de connexion: ${error.message}`);
    return null;
  }
}

/**
 * Test principal
 */
async function runTest() {
  console.log('🚀 Test du Rate Limiter Redis');
  console.log('================================');
  console.log(`API: ${API_BASE}`);
  console.log(`Endpoint: ${TEST_ENDPOINT}`);
  console.log(`Client ID: ${TEST_CONFIG.clientId}`);
  console.log(`Requêtes prévues: ${TEST_CONFIG.requests}`);
  console.log(`Intervalle: ${TEST_CONFIG.interval}ms`);

  // Vérifier le statut initial
  await checkRateLimitStatus();

  console.log('\n🔄 Envoi des requêtes de test...');
  
  const results = {
    success: 0,
    rateLimited: 0,
    errors: 0,
    responses: []
  };

  for (let i = 1; i <= TEST_CONFIG.requests; i++) {
    try {
      const response = await makeRequest(TEST_ENDPOINT, 'GET', null);

      const result = {
        request: i,
        status: response.status,
        rateLimitHeaders: {
          limit: response.headers['x-ratelimit-limit'],
          remaining: response.headers['x-ratelimit-remaining'],
          reset: response.headers['x-ratelimit-reset']
        }
      };

      if (response.status === 200) {
        results.success++;
        console.log(`   ✅ Requête ${i}: OK (${result.rateLimitHeaders.remaining} restantes)`);
      } else if (response.status === 429) {
        results.rateLimited++;
        console.log(`   🚫 Requête ${i}: Rate Limited (${response.body?.error?.message || 'Limite dépassée'})`);
      } else {
        results.errors++;
        console.log(`   ❌ Requête ${i}: Erreur ${response.status}`);
      }

      results.responses.push(result);

      // Attendre avant la prochaine requête
      if (i < TEST_CONFIG.requests) {
        await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.interval));
      }

    } catch (error) {
      results.errors++;
      console.log(`   ❌ Requête ${i}: Erreur de connexion - ${error.message}`);
    }
  }

  // Vérifier le statut final
  console.log('\n📊 Statut final du rate limiter:');
  await checkRateLimitStatus();

  // Résumé des résultats
  console.log('\n📈 Résultats du test:');
  console.log('====================');
  console.log(`✅ Succès: ${results.success}`);
  console.log(`🚫 Rate Limited: ${results.rateLimited}`);
  console.log(`❌ Erreurs: ${results.errors}`);
  console.log(`📊 Total: ${results.success + results.rateLimited + results.errors}`);

  // Validation
  console.log('\n🔍 Validation:');
  if (results.rateLimited > 0) {
    console.log('✅ Rate limiter fonctionne correctement (requêtes bloquées détectées)');
  } else if (results.success === TEST_CONFIG.requests) {
    console.log('⚠️  Aucune requête bloquée - vérifiez la configuration du rate limiter');
  } else {
    console.log('❌ Erreurs de connexion - vérifiez que l\'API est démarrée');
  }

  console.log('\n🏁 Test terminé');
}

// Lancer le test
if (require.main === module) {
  runTest().catch(error => {
    console.error('❌ Erreur lors du test:', error);
    process.exit(1);
  });
}

module.exports = { makeRequest, checkRateLimitStatus, runTest };