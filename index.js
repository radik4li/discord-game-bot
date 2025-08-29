// Import the necessary Discord.js classes
const { Client, GatewayIntentBits } = require('discord.js');
// Import the 'dotenv' library to handle environment variables
require('dotenv').config();

// Create a new Discord client instance with the required intents.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// IMPORTANT: Replace this placeholder with your actual n8n webhook URL.
// This is the URL that your Discord bot will send messages to.
const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;

// A variable to track the bot's active state
let botActive = true; // Changed to true by default

// Event listener for when the bot successfully logs in and is ready
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}!`);
  console.log(`🤖 Bot ID: ${client.user.id}`);
  console.log(`📢 Bot will respond when mentioned!`);
  
  // Set the bot's status
  client.user.setActivity('Mention me to chat!', { type: 'LISTENING' });
});

// Event listener for new messages
client.on("messageCreate", async (message) => {
  // Ignore messages from other bots to prevent infinite loops
  if (message.author.bot) return;

  // --- Commands (work without mention) ---
  
  // Command to start the bot
  if (message.content === "!startbot") {
    botActive = true;
    return message.reply("✅ Bot is now active! Mention me to chat.");
  }
  
  // Command to stop the bot
  if (message.content === "!stopbot") {
    botActive = false;
    return message.reply("⏸️ Bot stopped. Use !startbot to reactivate.");
  }
  
  // Command to check status
  if (message.content === "!status") {
    return message.reply(`🤖 Bot is ${botActive ? '✅ Active' : '⏸️ Inactive'}`);
  }

  // --- Bot Response Logic ---
  
  // Check if the bot is mentioned
  const botMentioned = message.mentions.has(client.user);
  
  // Alternative: Check if message starts with bot mention
  const mentionPrefix = `<@${client.user.id}>`;
  const mentionPrefixNick = `<@!${client.user.id}>`; // Nickname mention
  const startsWithMention = message.content.startsWith(mentionPrefix) || 
                           message.content.startsWith(mentionPrefixNick);
  
  // Only respond if bot is active AND mentioned
  if (botActive && (botMentioned || startsWithMention)) {
    try {
      // Remove the mention from the message to get clean text
      let cleanMessage = message.content
        .replace(mentionPrefix, '')
        .replace(mentionPrefixNick, '')
        .replace(`<@${client.user.id}>`, '') // Extra safety
        .replace(`<@!${client.user.id}>`, '') // Extra safety for nickname
        .trim();
      
      // If message is empty after removing mention, send a default message
      if (!cleanMessage) {
        cleanMessage = "Hello!";
      }
      
      console.log(`📨 Sending to n8n: "${cleanMessage}" from ${message.author.tag}`);
      
      // Send a POST request to the n8n webhook URL.
      const response = await fetch(n8nWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: cleanMessage, // Send the clean message without mention
          originalMessage: message.content, // Also send original if needed
          author: message.author.tag,
          authorId: message.author.id,
          channelId: message.channel.id,
          messageId: message.id,
          guildId: message.guild?.id,
          guildName: message.guild?.name,
        }),
      });

      // Handle the JSON response from n8n.
      const n8nResponseData = await response.json();
      
      console.log('📥 n8n response:', n8nResponseData);

      // Check if the response is a standard Discord webhook object
      if (typeof n8nResponseData === 'object' && ('content' in n8nResponseData || 'embeds' in n8nResponseData)) {
        // Send the complete webhook payload
        return message.channel.send(n8nResponseData);
      }
      
      // If the response is an array from n8n (for simple text)
      if (Array.isArray(n8nResponseData) && n8nResponseData.length > 0) {
        const outputObject = n8nResponseData.find(item => 'output' in item);
        if (outputObject && outputObject.output) {
          return message.reply(outputObject.output);
        }
      }
      
      // If response is just a string
      if (typeof n8nResponseData === 'string') {
        return message.reply(n8nResponseData);
      }
      
      // If response has a text or message field
      if (n8nResponseData.text) {
        return message.reply(n8nResponseData.text);
      }
      if (n8nResponseData.message) {
        return message.reply(n8nResponseData.message);
      }
      
      // Fallback if the response is malformed or empty
      console.log("n8n webhook returned a malformed or empty response:", n8nResponseData);
      return message.reply("Oops, the webhook sent an invalid response. Check your n8n workflow.");
      
    } catch (error) {
      console.error("Error sending message to n8n webhook:", error);
      return message.reply("An error occurred while trying to send the message to the workflow.");
    }
  }
  
  // Optional: Respond to direct messages (DMs) without needing mention
  if (message.channel.type === 'DM' && botActive && !message.author.bot) {
    try {
      console.log(`📨 DM from ${message.author.tag}: "${message.content}"`);
      
      const response = await fetch(n8nWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: message.content,
          author: message.author.tag,
          authorId: message.author.id,
          isDM: true,
          messageId: message.id,
        }),
      });

      const n8nResponseData = await response.json();
      
      // Handle response same as above
      if (typeof n8nResponseData === 'object' && ('content' in n8nResponseData || 'embeds' in n8nResponseData)) {
        return message.channel.send(n8nResponseData);
      }
      if (Array.isArray(n8nResponseData) && n8nResponseData.length > 0) {
        const outputObject = n8nResponseData.find(item => 'output' in item);
        if (outputObject && outputObject.output) {
          return message.reply(outputObject.output);
        }
      }
      if (typeof n8nResponseData === 'string') {
        return message.reply(n8nResponseData);
      }
      
    } catch (error) {
      console.error("Error handling DM:", error);
      return message.reply("An error occurred while processing your message.");
    }
  }
});

// Log the bot into Discord using the token from your .env file
client.login(process.env.DISCORD_TOKEN);
