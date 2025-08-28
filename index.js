// index.js - Discord Game Bot with n8n AI Integration
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
const userScores = new Map();

// Bot ready
client.once('ready', () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
  client.user.setActivity('!help for commands');
  console.log('📡 n8n webhook:', process.env.N8N_WEBHOOK_URL);
});

// Handle messages
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

// Start trivia game
async function startTrivia(message) {
  const channelId = message.channel.id;
  
  if (activeGames.has(channelId)) {
    return message.reply('⚠️ A trivia game is already active! Use `!stop` to end it.');
  }

  if (!process.env.N8N_WEBHOOK_URL) {
    return message.reply('❌ Bot not configured properly. Missing n8n webhook.');
  }

  try {
    console.log('Requesting trivia from n8n...');
    
    // Request trivia from n8n
    const response = await axios.post(process.env.N8N_WEBHOOK_URL, {
      action: 'get_trivia',
      channel_id: channelId,
      username: message.author.username,
      user_id: message.author.id,
      timestamp: Date.now()
    }, {
      timeout: 10000, // 10 second timeout
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('n8n response received:', response.data);

    const trivia = response.data;

    // Validate response
    if (!trivia || !trivia.question || !trivia.answer || !trivia.options) {
      throw new Error('Invalid trivia format from n8n');
    }

    // Store game state
    const gameState = {
      question: trivia.question,
      answer: trivia.answer.toLowerCase().trim(),
      originalAnswer: trivia.answer,
      options: trivia.options,
      startedBy: message.author.id,
      startedByName: message.author.username,
      startTime: Date.now(),
      answered: false,
      category: trivia.category || 'General',
      difficulty: trivia.difficulty || 'Medium'
    };
    
    activeGames.set(channelId, gameState);
    console.log(`Game started in channel ${channelId}, answer: ${gameState.answer}`);

    // Send trivia question
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('🧠 Trivia Time!')
      .setDescription(`**${trivia.question}**`)
      .addFields(
        { name: '📚 Category', value: gameState.category, inline: true },
        { name: '⭐ Difficulty', value: gameState.difficulty, inline: true },
        { name: '🏆 Points', value: '10-40 points', inline: true },
        { name: '📝 Options', value: trivia.options.map((opt, i) => `${i+1}. ${opt}`).join('\n'), inline: false }
      )
      .setFooter({ text: `Started by ${message.author.username} | 30 seconds | Type !stop to end` })
      .setTimestamp();

    const gameMessage = await message.reply({ embeds: [embed] });

    // Setup message collector
    const filter = (m) => !m.author.bot && m.channel.id === channelId;
    const collector = message.channel.createMessageCollector({ 
      filter, 
      time: 30000 
    });

    collector.on('collect', async (m) => {
      // Skip if it's a command
      if (m.content.startsWith('!')) return;

      const game = activeGames.get(channelId);
      if (!game || game.answered) return;

      const userAnswer = m.content.toLowerCase().trim();
      console.log(`User ${m.author.username} answered: "${userAnswer}", correct answer: "${game.answer}"`);
      
      // Check if answer is correct (flexible matching)
      let isCorrect = false;
      
      // Direct match
      if (userAnswer === game.answer) {
        isCorrect = true;
      }
      // Check if user typed the number of the option
      else if (game.options) {
        const optionNumber = parseInt(userAnswer);
        if (optionNumber >= 1 && optionNumber <= game.options.length) {
          const selectedOption = game.options[optionNumber - 1].toLowerCase().trim();
          if (selectedOption === game.answer || selectedOption.includes(game.answer) || game.answer.includes(selectedOption)) {
            isCorrect = true;
          }
        }
      }
      // Partial match (answer contains user input or vice versa)
      else if (userAnswer.length > 2 && (game.answer.includes(userAnswer) || userAnswer.includes(game.answer))) {
        isCorrect = true;
      }
      
      if (isCorrect) {
        // Mark as answered
        game.answered = true;
        activeGames.delete(channelId);
        collector.stop('answered');

        // Calculate points (faster = more points)
        const timeBonus = Math.max(0, 30 - Math.floor((Date.now() - game.startTime) / 1000));
        const points = 10 + timeBonus;

        // Update user score
        const userId = m.author.id;
        const userScore = userScores.get(userId) || { 
          username: m.author.username, 
          score: 0, 
          correct: 0,
          streak: 0,
          bestStreak: 0
        };
        userScore.score += points;
        userScore.correct++;
        userScore.streak++;
        if (userScore.streak > userScore.bestStreak) {
          userScore.bestStreak = userScore.streak;
        }
        userScores.set(userId, userScore);

        // Send success message
        const winEmbed = new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle('🎉 Correct!')
          .setDescription(`**${m.author}** got it right!`)
          .addFields(
            { name: '✅ Answer', value: game.originalAnswer, inline: true },
            { name: '💰 Points Earned', value: `+${points}`, inline: true },
            { name: '📊 Total Score', value: `${userScore.score}`, inline: true },
            { name: '🔥 Streak', value: `${userScore.streak}`, inline: true }
          )
          .setFooter({ text: timeBonus > 0 ? `⚡ Speed bonus: +${timeBonus}` : 'No speed bonus' })
          .setTimestamp();

        await m.reply({ embeds: [winEmbed] });
        
        console.log(`${m.author.username} answered correctly! Points: ${points}`);
      }
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'time' && activeGames.has(channelId)) {
        const game = activeGames.get(channelId);
        activeGames.delete(channelId);
        
        // Reset streaks for everyone
        userScores.forEach(score => {
          score.streak = 0;
        });
        
        const timeoutEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('⏰ Time\'s Up!')
          .setDescription('Nobody got the answer in time!')
          .addFields(
            { name: '❌ The answer was', value: game.originalAnswer || game.answer },
            { name: '💡 Next Game', value: 'Type `!trivia` to play again!' }
          )
          .setTimestamp();
        
        message.channel.send({ embeds: [timeoutEmbed] });
        console.log(`Game timed out in channel ${channelId}`);
      }
    });

  } catch (error) {
    console.error('Error with trivia:', error.message);
    activeGames.delete(channelId);
    
    const errorEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('❌ Error')
      .setDescription('Failed to get trivia question. Please try again.')
      .addFields({ name: 'Error', value: error.message || 'Unknown error' });
    
    await message.reply({ embeds: [errorEmbed] });
  }
}

// Stop game
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
    .addFields({ name: 'The answer was', value: game.originalAnswer || game.answer })
    .setTimestamp();
  
  await message.reply({ embeds: [stopEmbed] });
  console.log(`Game stopped by ${message.author.username}`);
}

// Show user score
async function showScore(message) {
  const userId = message.author.id;
  const userScore = userScores.get(userId);
  
  if (!userScore) {
    return message.reply('You haven\'t played any games yet! Use `!trivia` to start.');
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x00FFFF)
    .setTitle('📊 Your Stats')
    .setThumbnail(message.author.displayAvatarURL())
    .setDescription(`Player: ${message.author}`)
    .addFields(
      { name: '🏆 Total Points', value: `${userScore.score}`, inline: true },
      { name: '✅ Correct Answers', value: `${userScore.correct}`, inline: true },
      { name: '🔥 Best Streak', value: `${userScore.bestStreak}`, inline: true }
    )
    .setTimestamp();
  
  await message.reply({ embeds: [embed] });
}

// Show leaderboard
async function showLeaderboard(message) {
  if (userScores.size === 0) {
    return message.reply('No scores yet! Be the first to play `!trivia`');
  }
  
  const sorted = Array.from(userScores.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 10);
  
  const leaderboard = sorted
    .map((entry, index) => {
      const [userId, data] = entry;
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;
      return `${medal} <@${userId}> - **${data.score}** pts (${data.correct} correct)`;
    })
    .join('\n');
  
  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('🏆 Leaderboard - Top 10')
    .setDescription(leaderboard)
    .setFooter({ text: 'Play !trivia to climb the ranks!' })
    .setTimestamp();
  
  await message.reply({ embeds: [embed] });
}

// Get joke
async function getJoke(message) {
  try {
    const response = await axios.post(process.env.N8N_WEBHOOK_URL, {
      action: 'get_joke',
      username: message.author.username,
      timestamp: Date.now()
    }, {
      timeout: 5000
    });

    const joke = response.data.joke || response.data.text || 'No joke available';
    
    const embed = new EmbedBuilder()
      .setColor(0xFFFF00)
      .setTitle('😄 Here\'s a Joke!')
      .setDescription(joke)
      .setFooter({ text: `Requested by ${message.author.username}` })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
    
  } catch (error) {
    console.error('Error getting joke:', error.message);
    
    // Fallback jokes
    const jokes = [
      "Why do programmers prefer dark mode? Because light attracts bugs!",
      "Why did the developer go broke? Because he used up all his cache!",
      "What's a programmer's favorite hangout place? The Foo Bar!"
    ];
    const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
    
    await message.reply(`😄 ${randomJoke}`);
  }
}

// Login
console.log('🚀 Starting Discord Game Bot...');
console.log('📝 Checking environment variables...');
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ Missing DISCORD_TOKEN environment variable!');
  process.exit(1);
}
if (!process.env.N8N_WEBHOOK_URL) {
  console.warn('⚠️ Missing N8N_WEBHOOK_URL - bot will have limited functionality');
}

client.login(process.env.DISCORD_TOKEN)
  .catch(error => {
    console.error('❌ Failed to login:', error.message);
    process.exit(1);
  });
