// Import the necessary Discord.js classes
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
// Import the 'dotenv' library to handle environment variables
require('dotenv').config();

// Create a new Discord client instance with the required intents.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
});

// Get webhook URL from environment
const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;

// A variable to track the bot's active state
let botActive = true; // Active by default

// Event listener for when the bot successfully logs in and is ready
// Fixed: Using 'ready' is fine, the warning is just informational
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}!`);
  console.log(`🤖 Bot ID: ${client.user.id}`);
  console.log(`📢 Bot will respond when mentioned!`);
  console.log(`🔗 n8n webhook: ${n8nWebhookUrl || 'NOT CONFIGURED'}`);
  
  // Set the bot's status (fixed activity type)
  client.user.setActivity('Mention me to chat!', { type: ActivityType.Listening });
});

// Error handler to prevent crashes
client.on('error', error => {
  console.error('Discord client error:', error);
});

// Handle disconnections
client.on('disconnect', () => {
  console.log('Bot disconnected from Discord');
});

// Handle reconnections
client.on('reconnecting', () => {
  console.log('Bot reconnecting to Discord...');
});

// Handle warnings
client.on('warn', info => {
  console.log('Warning:', info);
});

// Event listener for new messages
client.on('messageCreate', async (message) => {
  // Ignore messages from bots
  if (message.author.bot) return;

  // --- Commands (work without mention) ---
  
  // Command to start the bot
  if (message.content === '!startbot') {
    botActive = true;
    return message.reply('✅ Bot is now active! Mention me to chat.');
  }
  
  // Command to stop the bot
  if (message.content === '!stopbot') {
    botActive = false;
    return message.reply('⏸️ Bot stopped. Use !startbot to reactivate.');
  }
  
  // Command to check status
  if (message.content === '!status') {
    const status = {
      active: botActive ? '✅ Active' : '⏸️ Inactive',
      webhook: n8nWebhookUrl ? '✅ Configured' : '❌ Not configured',
      uptime: Math.floor(client.uptime / 1000 / 60) + ' minutes'
    };
    return message.reply(`🤖 Bot Status:\n• State: ${status.active}\n• Webhook: ${status.webhook}\n• Uptime: ${status.uptime}`);
  }

  // --- Bot Response Logic ---
  
  // Check if the bot is mentioned
  const botMentioned = message.mentions.has(client.user);
  
  // Alternative: Check if message starts with bot mention
  const mentionPrefix = `<@${client.user.id}>`;
  const mentionPrefixNick = `<@!${client.user.id}>`;
  const startsWithMention = message.content.startsWith(mentionPrefix) || 
                           message.content.startsWith(mentionPrefixNick);
  
  // Only respond if bot is active AND mentioned
  if (botActive && (botMentioned || startsWithMention)) {
    // Check if webhook is configured
    if (!n8nWebhookUrl) {
      return message.reply('❌ n8n webhook is not configured. Please set N8N_WEBHOOK_URL in environment variables.');
    }
    
    try {
      // Remove the mention from the message to get clean text
      let cleanMessage = message.content
        .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
        .trim();
      
      // If message is empty after removing mention, send a default message
      if (!cleanMessage) {
        cleanMessage = "Hello!";
      }
      
      console.log(`📨 Sending to n8n: "${cleanMessage}" from ${message.author.tag}`);
      
      // Add typing indicator while processing
      await message.channel.sendTyping();
      
      // Send a POST request to the n8n webhook URL with timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(n8nWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: cleanMessage,
          originalMessage: message.content,
          author: message.author.tag,
          authorId: message.author.id,
          channelId: message.channel.id,
          messageId: message.id,
          guildId: message.guild?.id,
          guildName: message.guild?.name,
          timestamp: new Date().toISOString()
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeout);

      // Check if response is ok
      if (!response.ok) {
        console.error(`n8n returned status ${response.status}`);
        return message.reply(`❌ n8n webhook returned an error (status ${response.status})`);
      }

      // Handle the response from n8n
      let n8nResponseData;
      try {
        n8nResponseData = await response.json();
      } catch (parseError) {
        const textResponse = await response.text();
        console.log('Received non-JSON response:', textResponse);
        if (textResponse) {
          return message.reply(textResponse);
        }
        throw parseError;
      }
      
      console.log('📥 n8n response:', JSON.stringify(n8nResponseData).substring(0, 200));

      // Handle different response formats
      
      // 1. Discord webhook format with content or embeds
      if (typeof n8nResponseData === 'object' && n8nResponseData !== null) {
        if (n8nResponseData.content || n8nResponseData.embeds) {
          return message.channel.send(n8nResponseData);
        }
        
        // 2. Simple text response fields
        if (n8nResponseData.text) {
          return message.reply(n8nResponseData.text);
        }
        if (n8nResponseData.message) {
          return message.reply(n8nResponseData.message);
        }
        if (n8nResponseData.response) {
          return message.reply(n8nResponseData.response);
        }
        if (n8nResponseData.output) {
          return message.reply(n8nResponseData.output);
        }
      }
      
      // 3. Array response
      if (Array.isArray(n8nResponseData) && n8nResponseData.length > 0) {
        // Look for output field in array items
        const outputObject = n8nResponseData.find(item => item && typeof item === 'object' && 'output' in item);
        if (outputObject && outputObject.output) {
          return message.reply(outputObject.output);
        }
        
        // Try first item if it's a string
        if (typeof n8nResponseData[0] === 'string') {
          return message.reply(n8nResponseData[0]);
        }
        
        // Try first item's text/message field
        if (n8nResponseData[0]?.text) {
          return message.reply(n8nResponseData[0].text);
        }
        if (n8nResponseData[0]?.message) {
          return message.reply(n8nResponseData[0].message);
        }
      }
      
      // 4. Direct string response
      if (typeof n8nResponseData === 'string') {
        return message.reply(n8nResponseData);
      }
      
      // Fallback if we can't handle the response
      console.log("Unhandled response format from n8n:", n8nResponseData);
      return message.reply("I received a response but couldn't understand the format. Check the n8n workflow output.");
      
    } catch (error) {
      console.error("Error communicating with n8n:", error);
      
      if (error.name === 'AbortError') {
        return message.reply("⏱️ The request timed out. The n8n workflow might be taking too long.");
      }
      
      return message.reply("❌ An error occurred while processing your message. Please try again.");
    }
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  client.destroy();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit, try to recover
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit, try to recover
});

// Log the bot into Discord
console.log('🚀 Starting Discord bot...');
console.log('📝 Environment check:');
console.log(`  - Discord Token: ${process.env.DISCORD_TOKEN ? '✅ Set' : '❌ Missing'}`);
console.log(`  - n8n Webhook: ${n8nWebhookUrl ? '✅ Set' : '⚠️ Not configured'}`);

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN is not set in environment variables!');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error('❌ Failed to login to Discord:', error.message);
  if (error.message.includes('EAI_AGAIN')) {
    console.error('DNS resolution failed. This might be a network issue in the container.');
    console.error('Retrying in 5 seconds...');
    setTimeout(() => {
      client.login(process.env.DISCORD_TOKEN).catch(err => {
        console.error('Retry failed:', err.message);
        process.exit(1);
      });
    }, 5000);
  } else {
    process.exit(1);
  }
});
