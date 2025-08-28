const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const activeChannels = new Set(); // channels where chat is active

client.once('ready', () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
  client.user.setActivity('Type !startchat');
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();

  // Start bot in channel
  if (content === '!startchat') {
    if (activeChannels.has(message.channel.id)) {
      return message.channel.send("⚠️ I'm already active here!");
    }
    activeChannels.add(message.channel.id);
    return message.channel.send("💬 Chat mode activated! Talk to me 😘");
  }

  // Stop bot in channel
  if (content === '!stopchat') {
    if (!activeChannels.has(message.channel.id)) {
      return message.channel.send("⚠️ I'm not active here.");
    }
    activeChannels.delete(message.channel.id);
    return message.channel.send("🛑 Chat mode stopped. Call me back anytime with !startchat.");
  }

  // If chat not active in this channel, ignore
  if (!activeChannels.has(message.channel.id)) return;

  // Forward user message to n8n
  try {
    const response = await axios.post(process.env.N8N_WEBHOOK_URL, {
      action: "chat",
      user: message.author.username,
      content: message.content
    });

    let reply = response.data?.reply || "🤔 I don’t know what to say...";
    if (reply.length > 2000) reply = reply.slice(0, 1997) + "...";

    await message.channel.send(reply);

  } catch (err) {
    console.error("Chat error:", err.message);
    await message.channel.send("⚠️ Something went wrong while talking...");
  }
});

console.log("🚀 Starting bot...");
client.login(process.env.DISCORD_TOKEN);
