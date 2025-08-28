// Forward user message to n8n
try {
  const response = await axios.post(process.env.N8N_WEBHOOK_URL, {
    action: "chat",
    user: message.author.username,
    content: message.content
  });

  // Adapt to your webhook's format
  let reply;

  if (Array.isArray(response.data) && response.data.length > 0) {
    reply = response.data[0].output;
  } else if (response.data?.reply) {
    reply = response.data.reply;
  }

  if (!reply) reply = "🤔 I don’t know what to say...";
  if (reply.length > 2000) reply = reply.slice(0, 1997) + "...";

  await message.channel.send(reply);

} catch (err) {
  console.error("Chat error:", err.message);
  await message.channel.send("⚠️ Something went wrong while talking...");
}
