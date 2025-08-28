const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const activeGames = new Map();
const userScores = new Map();

client.once('ready', () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
  client.user.setActivity('!help for commands');
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  switch (command) {
    case 'help':
      return message.reply('Use `!trivia` to start the game!');
    case 'trivia':
      return startTrivia(message.channel);
    case 'score':
      return showScore(message);
  }
});

async function startTrivia(channel) {
  if (activeGames.has(channel.id)) return;

  await askQuestion(channel);
}

async function askQuestion(channel) {
  try {
    const response = await axios.post(process.env.N8N_WEBHOOK_URL, { action: 'get_trivia' });
    const trivia = response.data;

    if (!trivia || !trivia.question || !trivia.answer || !trivia.options) {
      return channel.send('❌ Invalid trivia format from server.');
    }

    activeGames.set(channel.id, {
      answer: trivia.answer.toLowerCase().trim(),
      originalAnswer: trivia.answer,
      options: trivia.options
    });

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('🧠 Trivia Time!')
      .setDescription(`**${trivia.question}**`)
      .addFields({ name: 'Options', value: trivia.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n') })
      .setFooter({ text: 'You have 30 seconds to answer!' });

    await channel.send({ embeds: [embed] });

    const filter = m => !m.author.bot;
    const collector = channel.createMessageCollector({ filter, time: 30000 });

    let answered = false;

    collector.on('collect', m => {
      const game = activeGames.get(channel.id);
      if (!game) return;

      const content = m.content.toLowerCase().trim();
      const correct = content === game.answer ||
        parseInt(content) > 0 && game.options[parseInt(content) - 1]?.toLowerCase() === game.answer;

      answered = true;
      collector.stop();

      if (correct) {
        const score = userScores.get(m.author.id) || { username: m.author.username, score: 0 };
        score.score += 10;
        userScores.set(m.author.id, score);
        channel.send(`🎉 Correct answer by ${m.author}!`);
      } else {
        channel.send(`❌ Wrong answer, but at least you tried! The correct answer was **${game.originalAnswer}**`);
      }

      setTimeout(() => askQuestion(channel), 1500); // Continue to next question
    });

    collector.on('end', () => {
      if (!answered) {
        activeGames.delete(channel.id);
        channel.send('⏰ Time is up! Nobody answered. Game over.');
      }
    });

  } catch (error) {
    console.error('Trivia error:', error.message);
    channel.send('⚠️ Could not fetch trivia question.');
    activeGames.delete(channel.id);
  }
}

async function showScore(message) {
  const score = userScores.get(message.author.id);
  if (!score) return message.reply('You haven’t scored yet!');

  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle('📊 Your Score')
    .addFields({ name: 'Points', value: `${score.score}` });

  await message.reply({ embeds: [embed] });
}

console.log('🚀 Starting bot...');
client.login(process.env.DISCORD_TOKEN);
