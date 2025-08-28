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
let botActive = false;

// Event listener for when the bot successfully logs in and is ready
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}!`);
});

// Event listener for new messages
client.on("messageCreate", async (message) => {
  // Ignore messages from other bots to prevent infinite loops
  if (message.author.bot) return;

  // --- Commands ---

  // Command to start the bot
  if (message.content === "!startbot") {
    botActive = true;
    return message.reply("✅ Bot is now active!");
  }

  // Command to stop the bot
  if (message.content === "!stopbot") {
    botActive = false;
    return message.reply("⏸️ Bot stopped.");
  }

  // --- Bot Response Logic ---

  // If the bot is active, send the message to the n8n webhook
  if (botActive) {
    try {
      // Send a POST request to the n8n webhook URL.
      // The request body contains the message content and other useful data.
      const response = await fetch(n8nWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: message.content,
          author: message.author.tag,
          channelId: message.channel.id,
          messageId: message.id,
        }),
      });

      // You can choose to handle the response from n8n here, if needed.
      // For example, if n8n returns a JSON with the response text, you can read it.
      const n8nResponseData = await response.json();
      if (n8nResponseData.responseMessage) {
        return message.reply(n8nResponseData.responseMessage);
      }

    } catch (error) {
      console.error("Error sending message to n8n webhook:", error);
      return message.reply("An error occurred while trying to send the message to the workflow.");
    }
  }
});

// Log the bot into Discord using the token from your .env file
client.login(process.env.DISCORD_TOKEN);
