// index.js - Discord Game Bot with Scoring System
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Game storage
const activeGames = new Map();
const userScores = new Map(); // Store user scores

client.once('ready', () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
  client.user.setActivity('!help for commands');
  console.log('📡 n8n webhook:', process.env.N8N_WEBHOOK_URL);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  switch (command) {
    case 'help':
      const helpEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('🎮 Game Bot Commands')
        .setDescription('Available commands:')
        .addFields(
          { name: '!help', value: 'Show this message' },
          { name: '!trivia', value: 'Start a trivia game' },
          { name: '!stop', value: 'Stop the current game' },
          { name: '!score', value: 'Check your score' },
          { name: '!leaderboard', value: 'Show top players' },
          { name: '!joke', value: 'Get a random joke' }
        );
      return message.reply({ embeds: [helpEmbed] });

    case 'trivia':
      await startTrivia(message);
      break;

    case 'stop':
      await stopGame(message);
      break;

    case 'score':
      await showScore(message);
      break;

    case 'leaderboard':
      await showLeaderboard(message);
      break;

    case 'joke':
      await getJoke(message);
      break;

    default:
      await message.reply('Unknown command! Use `!help`');
  }
});

async function startTrivia(message) {
  const channelId = message.channel.id;
  
  // Check if game already active
  if (activeGames.has(channelId)) {
    return message.reply('⚠️ A trivia game is already active! Use `!stop` to end it.');
  }

  try {
    // Get trivia from n8n
    const response = await axios.post(process.env.N8N_WEBHOOK_URL, {
      action: 'get_trivia',
      channel_id: channelId,
      user_id: message.author.id,
      username: message.author.username,
      timestamp: Date.now() // Add timestamp to ensure variety
    });

    const trivia = response.data;

    if (!trivia.question || !trivia.answer || !trivia.options) {
      throw new Error('Invalid trivia data');
    }

    // Store game state
    const gameState = {
      answer: trivia.answer.toLowerCase().trim(),
      question: trivia.question,
      startedBy: message.author.id,
      startTime: Date.now(),
      answered: false,
      category: trivia.category || 'General'
    };
    
    activeGames.set(channelId, gameState);

    // Send trivia question
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('🧠 Trivia Time!')
      .setDescription(trivia.question)
      .addFields(
        { name: 'Category', value: gameState.category, inline: true },
        { name: 'Points', value: '10 points', inline: true },
        { name: 'Time Limit', value: '30 seconds', inline: true },
        { name: 'Options', value: trivia.options.map((opt, i) => `${i+1}. ${opt}`).join('\n') }
      )
      .setFooter({ text: `Started by ${message.author.username} | Type !stop to end` });

    await message.reply({ embeds: [embed] });

    // Setup message collector
    const filter = (m) => !m.author.bot;
    const collector = message.channel.createMessageCollector({ 
      filter, 
      time: 30000 
    });

    collector.on('collect', async (m) => {
      // Check for stop command
      if (m.content.toLowerCase() === '!stop') {
        return; // Let the stop command handler deal with it
      }

      const game = activeGames.get(channelId);
      if (!game || game.answered) return;

      const userAnswer = m.content.toLowerCase().trim();
      
      // Check if answer is correct
      if (userAnswer === game.answer || 
          userAnswer === game.answer.replace(/^(the |a |an )/i, '') || // Remove articles
          userAnswer.includes(game.answer) || 
          game.answer.includes(userAnswer)) {
        
        // Mark as answered
        game.answered = true;
        activeGames.delete(channelId);
        collector.stop('answered');

        // Calculate points (faster = more points)
        const timeBonus = Math.max(0, 30 - Math.floor((Date.now() - game.startTime) / 1000));
        const points = 10 + timeBonus;

        // Update user score
        const userId = m.author.id;
        const currentScore = userScores.get(userId) || { username: m.author.username, score: 0, correct: 0 };
        currentScore.score += points;
        currentScore.correct++;
        userScores.set(userId, currentScore);

        // Send success message
        const winEmbed = new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle('🎉 Correct!')
          .setDescription(`**${m.author}** got it right!`)
          .addFields(
            { name: 'Answer', value: trivia.answer, inline: true },
            { name: 'Points Earned', value: `+${points}`, inline: true },
            { name: 'Total Score', value: `${currentScore.score}`, inline: true }
          )
          .setFooter({ text: timeBonus > 0 ? `Speed bonus: +${timeBonus}` : 'No speed bonus' });

        await m.reply({ embeds: [winEmbed] });
      }
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'time' && activeGames.has(channelId)) {
        const game = activeGames.get(channelId);
        activeGames.delete(channelId);
        
        const timeoutEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('⏰ Time\'s Up!')
          .setDescription('Nobody got the answer in time!')
          .addFields(
            { name: 'The answer was', value: game.answer },
            { name: 'Next Game', value: 'Type `!trivia` to play again!' }
          );
        
        message.channel.send({ embeds: [timeoutEmbed] });
      }
    });

  } catch (error) {
    console.error('Error with trivia:', error.message);
    
    // Fallback to local questions if n8n fails
    const localQuestions = [
      { question: "What is 2+2?", answer: "4", options: ["3", "4", "5", "6"] },
      { question: "What color is the sky?", answer: "blue", options: ["Red", "Blue", "Green", "Yellow"] }
    ];
    
    const trivia = localQuestions[Math.floor(Math.random() * localQuestions.length)];
    
    activeGames.set(channelId, {
      answer: trivia.answer.toLowerCase(),
      question: trivia.question,
      startedBy: message.author.id,
      startTime: Date.now(),
      answered: false
    });

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('🧠 Trivia Time! (Offline Mode)')
      .setDescription(trivia.question)
      .addFields({ name: 'Options', value: trivia.options.join('\n') })
      .setFooter({ text: 'Type your answer!' });

    await message.reply({ embeds: [embed] });
  }
}

async function stopGame(message) {
  const channelId = message.channel.id;
  
  if (!activeGames.has(channelId)) {
    return message.reply('❌ No active game in this channel!');
  }
  
  const game = activeGames.get(channelId);
  activeGames.delete(channelId);
  
  const stopEmbed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('🛑 Game Stopped')
    .setDescription(`Game stopped by ${message.author}`)
    .addFields({ name: 'Answer was', value: game.answer });
  
  await message.reply({ embeds: [stopEmbed] });
}

async function showScore(message) {
  const userId = message.author.id;
  const userScore = userScores.get(userId);
  
  if (!userScore) {
    return message.reply('You haven\'t played any games yet! Use `!trivia` to start.');
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x00FFFF)
    .setTitle('📊 Your Score')
    .setDescription(`Stats for ${message.author}`)
    .addFields(
      { name: 'Total Points', value: `${userScore.score}`, inline: true },
      { name: 'Correct Answers', value: `${userScore.correct}`, inline: true }
    );
  
  await message.reply({ embeds: [embed] });
}

async function showLeaderboard(message) {
  if (userScores.size === 0) {
    return message.reply('No scores yet! Be the first to play `!trivia`');
  }
  
  // Sort users by score
  const sorted = Array.from(userScores.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 10);
  
  const leaderboard = sorted
    .map((entry, index) => {
      const [userId, data] = entry;
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      return `${medal} <@${userId}> - **${data.score}** points (${data.correct} correct)`;
    })
    .join('\n');
  
  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🏆 Leaderboard')
    .setDescription(leaderboard || 'No scores yet!')
    .setFooter({ text: 'Play !trivia to climb the ranks!' });
  
  await message.reply({ embeds: [embed] });
}

async function getJoke(message) {
  try {
    const response = await axios.post(process.env.N8N_WEBHOOK_URL, {
      action: 'get_joke'
    });

    const joke = response.data.joke || 'No joke available';
    
    const embed = new EmbedBuilder()
      .setColor(0xFFFF00)
      .setTitle('😄 Joke!')
      .setDescription(joke);

    await message.reply({ embeds: [embed] });
  } catch (error) {
    await message.reply('Why did the bot cross the road? To get a better connection! 😄');
  }
}

// Login
console.log('🚀 Starting bot...');
client.login(process.env.DISCORD_TOKEN);
