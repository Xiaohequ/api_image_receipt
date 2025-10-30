#!/usr/bin/env node

/**
 * Script pour vérifier la configuration OpenAI
 * Usage: node scripts/check-openai.js
 */

require('dotenv').config();

async function checkOpenAI() {
    console.log('🔍 Vérification de la configuration OpenAI...');

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const maxTokens = process.env.OPENAI_MAX_TOKENS || '1000';
    const temperature = process.env.OPENAI_TEMPERATURE || '0.1';

    console.log(`   Modèle: ${model}`);
    console.log(`   Max tokens: ${maxTokens}`);
    console.log(`   Température: ${temperature}`);

    // Vérifier la présence de la clé API
    if (!apiKey) {
        console.error('❌ OPENAI_API_KEY n\'est pas définie dans le fichier .env');
        console.log('\n💡 Solutions:');
        console.log('   1. Copiez .env.example vers .env');
        console.log('   2. Obtenez une clé API sur https://platform.openai.com/api-keys');
        console.log('   3. Ajoutez OPENAI_API_KEY=votre_clé_ici dans .env');
        return false;
    }

    // Vérifier le format de la clé API
    if (!apiKey.startsWith('sk-')) {
        console.error('❌ Format de clé API OpenAI invalide (doit commencer par "sk-")');
        console.log(`   Clé actuelle: ${apiKey.substring(0, 10)}...`);
        return false;
    }

    console.log(`   Clé API: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)} ✅`);

    // Tester la connexion à OpenAI
    try {
        console.log('🔌 Test de connexion à OpenAI...');

        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey });

        // Test simple avec l'API
        const response = await openai.models.list();

        if (response && response.data && response.data.length > 0) {
            console.log('✅ Connexion OpenAI réussie!');
            console.log(`   Modèles disponibles: ${response.data.length}`);

            // Vérifier si le modèle configuré est disponible
            const modelExists = response.data.some(m => m.id === model);
            if (modelExists) {
                console.log(`   Modèle "${model}" disponible ✅`);
            } else {
                console.warn(`   ⚠️  Modèle "${model}" non trouvé dans la liste`);
                console.log('   Modèles recommandés:');
                const recommendedModels = response.data
                    .filter(m => m.id.includes('gpt'))
                    .slice(0, 5)
                    .map(m => `     - ${m.id}`)
                    .join('\n');
                console.log(recommendedModels);
            }
        } else {
            console.warn('⚠️  Réponse inattendue de l\'API OpenAI');
        }

        return true;

    } catch (error) {
        console.error('❌ Erreur lors du test OpenAI:');

        if (error.status === 401) {
            console.error('   Clé API invalide ou expirée');
            console.log('   💡 Vérifiez votre clé sur https://platform.openai.com/api-keys');
        } else if (error.status === 429) {
            console.error('   Limite de taux dépassée');
            console.log('   💡 Attendez quelques minutes avant de réessayer');
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            console.error('   Problème de connexion réseau');
            console.log('   💡 Vérifiez votre connexion internet');
        } else {
            console.error(`   ${error.message}`);
        }

        return false;
    }
}

// Test de charge de la configuration depuis .env
function checkEnvFile() {
    console.log('📁 Vérification du fichier .env...');

    const fs = require('fs');
    const path = require('path');

    const envPath = path.join(process.cwd(), '.env');

    if (!fs.existsSync(envPath)) {
        console.error('❌ Fichier .env non trouvé');
        console.log('💡 Copiez .env.example vers .env et configurez vos variables');
        return false;
    }

    console.log('✅ Fichier .env trouvé');

    // Lire le contenu pour vérifier OPENAI_API_KEY
    const envContent = fs.readFileSync(envPath, 'utf8');
    const hasOpenAIKey = envContent.includes('OPENAI_API_KEY=') &&
        !envContent.includes('OPENAI_API_KEY=your_openai_api_key_here');

    if (!hasOpenAIKey) {
        console.warn('⚠️  OPENAI_API_KEY non configurée dans .env');
        return false;
    }

    console.log('✅ OPENAI_API_KEY configurée dans .env');
    return true;
}

// CLI
if (require.main === module) {
    async function main() {
        console.log('🤖 Vérification de la configuration OpenAI');
        console.log('==========================================\n');

        const envOk = checkEnvFile();
        console.log('');

        if (envOk) {
            const openaiOk = await checkOpenAI();
            console.log('');

            if (openaiOk) {
                console.log('🎉 Configuration OpenAI validée avec succès!');
                process.exit(0);
            } else {
                console.log('❌ Problème avec la configuration OpenAI');
                process.exit(1);
            }
        } else {
            console.log('❌ Problème avec le fichier .env');
            process.exit(1);
        }
    }

    main().catch(error => {
        console.error('Erreur:', error);
        process.exit(1);
    });
}

module.exports = { checkOpenAI, checkEnvFile };