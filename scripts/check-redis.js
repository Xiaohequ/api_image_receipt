#!/usr/bin/env node

/**
 * Script pour vérifier la disponibilité de Redis
 * Usage: node scripts/check-redis.js
 */

const { createClient } = require('redis');
require('dotenv').config();

const REDIS_CONFIG = {
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  password: process.env.REDIS_PASSWORD || undefined,
};

async function checkRedis() {
  console.log('🔍 Vérification de la connexion Redis...');
  console.log(`   Host: ${REDIS_CONFIG.socket.host}`);
  console.log(`   Port: ${REDIS_CONFIG.socket.port}`);
  console.log(`   Password: ${REDIS_CONFIG.password ? '***' : 'Non configuré'}`);

  const client = createClient(REDIS_CONFIG);

  try {
    // Gérer les erreurs de connexion
    client.on('error', (error) => {
      console.error('❌ Erreur Redis:', error.message);
    });

    // Se connecter
    console.log('🔌 Connexion à Redis...');
    await client.connect();

    // Tester avec un ping
    console.log('🏓 Test ping...');
    const pong = await client.ping();
    console.log(`   Réponse: ${pong}`);

    // Tester l'écriture/lecture
    console.log('📝 Test écriture/lecture...');
    const testKey = 'test:connection:' + Date.now();
    const testValue = 'Hello Redis!';
    
    await client.set(testKey, testValue, { EX: 10 }); // Expire dans 10 secondes
    const retrievedValue = await client.get(testKey);
    
    if (retrievedValue === testValue) {
      console.log('   ✅ Écriture/lecture OK');
    } else {
      console.log('   ❌ Problème écriture/lecture');
      console.log(`   Attendu: ${testValue}`);
      console.log(`   Reçu: ${retrievedValue}`);
    }

    // Nettoyer
    await client.del(testKey);

    // Obtenir des infos sur Redis
    console.log('📊 Informations Redis:');
    const info = await client.info('server');
    const lines = info.split('\r\n');
    
    const relevantInfo = lines.filter(line => 
      line.startsWith('redis_version:') ||
      line.startsWith('redis_mode:') ||
      line.startsWith('uptime_in_seconds:') ||
      line.startsWith('connected_clients:')
    );

    relevantInfo.forEach(line => {
      if (line.trim()) {
        const [key, value] = line.split(':');
        console.log(`   ${key}: ${value}`);
      }
    });

    // Vérifier l'espace disponible
    const memoryInfo = await client.info('memory');
    const memoryLines = memoryInfo.split('\r\n');
    const usedMemory = memoryLines.find(line => line.startsWith('used_memory_human:'));
    if (usedMemory) {
      console.log(`   ${usedMemory}`);
    }

    console.log('✅ Redis est disponible et fonctionne correctement!');
    return true;

  } catch (error) {
    console.error('❌ Erreur lors de la vérification Redis:');
    console.error(`   ${error.message}`);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Solutions possibles:');
      console.log('   1. Vérifiez que Redis est démarré');
      console.log('   2. Vérifiez l\'host et le port dans .env');
      console.log('   3. Vérifiez les règles de firewall');
      console.log('\n🐳 Pour démarrer Redis avec Docker:');
      console.log('   docker run -d -p 6379:6379 --name redis redis:alpine');
    }
    
    return false;

  } finally {
    try {
      await client.quit();
      console.log('🔌 Connexion fermée');
    } catch (error) {
      // Ignorer les erreurs de fermeture
    }
  }
}

// Fonction pour attendre que Redis soit disponible
async function waitForRedis(maxAttempts = 10, delay = 2000) {
  console.log(`⏳ Attente de Redis (max ${maxAttempts} tentatives, délai ${delay}ms)...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`\n🔄 Tentative ${attempt}/${maxAttempts}`);
    
    const isAvailable = await checkRedis();
    
    if (isAvailable) {
      console.log('🎉 Redis est prêt!');
      return true;
    }
    
    if (attempt < maxAttempts) {
      console.log(`⏱️  Attente ${delay}ms avant la prochaine tentative...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  console.log('❌ Redis n\'est pas disponible après toutes les tentatives');
  return false;
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'wait') {
    const maxAttempts = parseInt(args[1]) || 10;
    const delay = parseInt(args[2]) || 2000;
    
    waitForRedis(maxAttempts, delay)
      .then(success => process.exit(success ? 0 : 1))
      .catch(error => {
        console.error('Erreur:', error);
        process.exit(1);
      });
  } else {
    checkRedis()
      .then(success => process.exit(success ? 0 : 1))
      .catch(error => {
        console.error('Erreur:', error);
        process.exit(1);
      });
  }
}

module.exports = { checkRedis, waitForRedis };