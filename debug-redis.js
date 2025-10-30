#!/usr/bin/env node

const { createClient } = require('redis');
require('dotenv').config();

async function debugRedis() {
    const client = createClient({
        socket: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
        },
        password: process.env.REDIS_PASSWORD || undefined,
    });

    try {
        await client.connect();
        console.log('✅ Connecté à Redis');

        // Voir toutes les clés
        const keys = await client.keys('*');
        console.log(`📊 Nombre total de clés: ${keys.length}`);

        if (keys.length > 0) {
            console.log('🔑 Clés trouvées:');
            keys.forEach(key => console.log(`   ${key}`));
        }

        // Chercher spécifiquement les clés de rate limiting
        const rateLimitKeys = await client.keys('*rate*');
        console.log(`🚫 Clés de rate limiting: ${rateLimitKeys.length}`);

        if (rateLimitKeys.length > 0) {
            console.log('🔑 Clés de rate limiting:');
            for (const key of rateLimitKeys) {
                const value = await client.get(key);
                const ttl = await client.ttl(key);
                console.log(`   ${key}: ${value} (TTL: ${ttl}s)`);
            }
        }

        // Chercher les clés avec le préfixe api_rate_limit
        const apiKeys = await client.keys('api_rate_limit*');
        console.log(`🔑 Clés API rate limit: ${apiKeys.length}`);

        if (apiKeys.length > 0) {
            for (const key of apiKeys) {
                const value = await client.get(key);
                const ttl = await client.ttl(key);
                console.log(`   ${key}: ${value} (TTL: ${ttl}s)`);
            }
        }

    } catch (error) {
        console.error('❌ Erreur:', error.message);
    } finally {
        await client.quit();
    }
}

debugRedis();