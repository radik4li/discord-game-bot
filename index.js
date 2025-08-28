const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const activeGames = new Map();

client.once('ready', () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
  client.user.setActivity('!help for commands');
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return; // Ignore bots
  if (!message.content.startsWith('!')) return; // Commands start with !

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

  if (!N8N_WEBHOOK_URL) {
    return message.reply('⚠️ n8n webhook URL is not configured.');
  }

  switch (command) {
    case 'help':
      const helpEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('🎮 Game Bot Commands')
        .setDescription('Available commands:')
        .addFields(
          { name: '!help', value: 'Show this message' },
          { name: '!trivia', value: 'Start a trivia game' },
          { name: '!joke', value: 'Get a random joke' }
        );
      return message.reply({ embeds: [helpEmbed] });

    case 'trivia':
      if (activeGames.has(message.channel.id)) {
        return message.reply('A trivia game is already active in this channel!');
      }

      try {
        // Ask n8n for a trivia question
        const response = await axios.post(N8N_WEBHOOK_URL, {
          action: 'get_trivia',
          channel_id: message.channel.id,
          user_id: message.author.id,
          username: message.author.username,
        });

        const trivia = response.data;

        if (!trivia.question || !trivia.answer || !trivia.options) {
          return message.reply('Invalid trivia data received from n8n.');
        }

        // Save current game state
        activeGames.set(message.channel.id, {
          answer: trivia.answer.toLowerCase(),
          timeoutId: null,
        });

        // Send trivia question as embed
        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('🧠 Trivia Time!')
          .setDescription(trivia.question)
          .addFields({ name: 'Options', value: trivia.options.join('\n') })
          .setFooter({ text: 'Type your answer within 30 seconds!' });

        await message.reply({ embeds: [embed] });

        // Setup message collector for answers
        const filter = (m) => !m.author.bot && activeGames.has(m.channel.id);
        const collector = message.channel.createMessageCollector({ filter, time: 30000 });

        collector.on('collect', async (m) => {
          const game = activeGames.get(m.channel.id);
          if (!game) return;

          // Send user answer to n8n to check correctness (optional)
          try {
            const validationResponse = await axios.post(N8N_WEBHOOK_URL, {
              action: 'validate_answer',
              user_answer: m.content,
              correct_answer: game.answer,
              user_id: m.author.id,
              username: m.author.username,
              channel_id: m.channel.id,
            });

            if (validationResponse.data.correct) {
              activeGames.delete(m.channel.id);
              collector.stop();

              m.reply(`✅ Correct answer, well done ${m.author}! 🎉`);
            }
          } catch (err) {
            // fallback to local check if n8n validation fails
            if (m.content.toLowerCase() === game.answer) {
              activeGames.delete(m.channel.id);
              collector.stop();
              m.reply(`✅ Correct answer, well done ${m.author}! 🎉`);
            }
          }
        });

        collector.on('end', (collected, reason) => {
          if (reason === 'time' && activeGames.has(message.channel.id)) {
            activeGames.delete(message.channel.id);
            message.channel.send(`⏰ Time's up! The correct answer was: **${trivia.answer}**`);
          }
        });
      } catch (error) {
        console.error('Error getting trivia from n8n:', error);
        return message.reply('Failed to get trivia question. Please try again later.');
      }
      break;

    case 'joke':
      try {
        const response = await axios.post(N8N_WEBHOOK_URL, {
          action: 'get_joke',
          user_id: message.author.id,
          username: message.author.username,
          channel_id: message.channel.id,
        });

        const joke = response.data.joke || null;

        if (joke) {
          const embed = new EmbedBuilder()
            .setColor(0xffff00)
            .setTitle('😄 Joke!')
            .setDescription(joke);

          await message.reply({ embeds: [embed] });
        } else {
          await message.reply('No joke available right now.');
        }
      } catch (error) {
        console.error('Error getting joke from n8n:', error);
        await message.reply('Failed to get joke. Please try again later.');
      }
      break;

    default:
      await message.reply('Unknown command! Use `!help` to see available commands.');
  }
});

// Login the bot
client.login(process.env.DISCORD_TOKEN);
