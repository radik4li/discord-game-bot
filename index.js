client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();

  // start/stop commands
  if (content === '!startchat') {
    if (activeChannels.has(message.channel.id)) {
      return message.channel.send("⚠️ I'm already active here!");
    }
    activeChannels.add(message.channel.id);
    return message.channel.send("💬 Chat mode activated! Talk to me 😘");
  }

  if (content === '!stopchat') {
    if (!activeChannels.has(message.channel.id)) {
      return message.channel.send("⚠️ I'm not active here.");
    }
    activeChannels.delete(message.channel.id);
    return message.channel.send("🛑 Chat mode stopped. Call me back anytime with !startchat.");
  }

  // If chat not active, ignore
  if (!activeChannels.has(message.channel.id)) return;

  // Forward message to n8n
  try {
    const response = await axios.post(process.env.N8N_WEBHOOK_URL, {
      action: "chat",
      user: message.author.username,
      content: message.content
    });

    let reply;

    // handle different webhook formats
    if (Array.isArray(response.data) && response.data.length > 0 && response.data[0].output) {
      reply = response.data[0].output;
    } else if (response.data?.reply) {
      reply = response.data.reply;
    } else {
      reply = "🤔 I don’t know what to say...";
    }

    if (reply.length > 2000) reply = reply.slice(0, 1997) + "...";

    await message.channel.send(reply);

  } catch (err) {
    console.error("Chat error:", err.message);
    await message.channel.send("⚠️ Something went wrong while talking...");
  }
});
