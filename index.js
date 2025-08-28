const { Client, GatewayIntentBits, Collection } = require('discord.js');
const express = require('express');
const { callN8nWebhook } = require('./utils/n8n');
const { initDatabase } = require('./utils/database');

// Health check server (for Coolify)
const app = express();
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: Date.now(),
        uptime: process.uptime()
    });
});
app.listen(process.env.HEALTH_PORT || 3001);

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Load commands
client.commands = new Collection();
// ... command loading logic

client.once('ready', async () => {
    console.log(`✅ Bot is online as ${client.user.tag}`);
    
    // Initialize database connection
    if (process.env.DATABASE_URL) {
        await initDatabase();
    }
    
    // Test n8n connection
    try {
        await callN8nWebhook('test', { status: 'bot_started' });
        console.log('✅ n8n connection successful');
    } catch (error) {
        console.error('⚠️ n8n connection failed:', error.message);
    }
});

client.login(process.env.DISCORD_TOKEN);
