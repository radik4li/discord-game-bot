// Import the necessary Discord.js and OpenAI classes
const { Client, GatewayIntentBits } = require('discord.js');
const OpenAI = require('openai');

// Import the 'dotenv' library to handle environment variables
// This allows you to securely store your bot token and API key
// Make sure you have a .env file with DISCORD_TOKEN and OPENAI_API_KEY
require('dotenv').config();

// Create a new Discord client instance with the required intents.
// Intents define what events your bot can listen to.
// GatewayIntentBits.Guilds and GatewayIntentBits.GuildMessages are required for message events.
// GatewayIntentBits.MessageContent is required to read the content of messages.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Initialize the OpenAI client using your API key from the environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    // Use .reply() for a direct response to the message
    return message.reply("✅ Bot is now active!");
  }

  // Command to stop the bot
  if (message.content === "!stopbot") {
    botActive = false;
    return message.reply("⏸️ Bot stopped.");
  }

  // --- Bot Response Logic ---

  // If the bot is active, call the OpenAI API
  if (botActive) {
    try {
      // Call OpenAI with the user's message
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: message.content }],
      });

      // Send the response back to the channel.
      // The `?` is optional chaining to prevent errors if the path is not found.
      const botReply = response.choices?.[0]?.message?.content;
      if (botReply) {
        return message.reply(botReply);
      } else {
        console.error("OpenAI response was empty.");
        return message.reply("Oops, something went wrong with the AI response.");
      }

    } catch (error) {
      console.error("Error calling OpenAI API:", error);
      return message.reply("An error occurred while trying to get a response from the AI.");
    }
  }
});

// Log the bot into Discord using the token from your .env file
client.login(process.env.DISCORD_TOKEN);

