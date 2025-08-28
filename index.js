client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // Commands
  if (message.content === "!startbot") {
    botActive = true;
    return message.reply("✅ Bot is now active!");
  }

  if (message.content === "!stopbot") {
    botActive = false;
    return message.reply("⏸️ Bot stopped.");
  }

  // If bot is active, respond
  if (botActive) {
    // Call OpenAI here
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: message.content }]
    });

    return message.reply(response.choices[0].message.content);
  }
});
