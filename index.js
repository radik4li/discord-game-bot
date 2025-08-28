const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
  client.user.setActivity('Chatting politely 😉');
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  try {
    // Send user message to n8n webhook
    const response = await axios.post(process.env.N8N_WEBHOOK_URL, {
      action: "chat",
      user: message.author.username,
      content: message.content
    });

    const reply = response.data?.reply || "🤔 I don’t know what to say...";

    await message.reply(reply);

  } catch (err) {
    console.error("Chat error:", err.message);
    await message.reply("⚠️ Something went wrong talking to me...");
  }
});

console.log("🚀 Starting bot...");
client.login(process.env.DISCORD_TOKEN);
