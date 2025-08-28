// index.js - Simple Discord Game Bot with n8n
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Simple in-memory storage for active games
const activeGames = new Map();

// When bot is ready
client.once('ready', () => {
    console.log(`✅ Bot is online as ${client.user.tag}`);
    client.user.setActivity('!help for commands', { type: 'PLAYING' });
});

// Handle messages
client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;
    
    // Check if message starts with !
    if (!message.content.startsWith('!')) return;
    
    // Get command
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    // Handle commands
    switch (command) {
        case 'help':
            const helpEmbed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('🎮 Game Bot Commands')
                .setDescription('Here are my commands:')
                .addFields(
                    { name: '!help', value: 'Show this menu', inline: true },
                    { name: '!ping', value: 'Check if bot is alive', inline: true },
                    { name: '!trivia', value: 'Start a trivia game', inline: true },
                    { name: '!joke', value: 'Get a random joke', inline: true }
                )
                .setTimestamp();
            
            await message.reply({ embeds: [helpEmbed] });
            break;
            
        case 'ping':
            await message.reply('🏓 Pong! Bot is working!');
            break;
            
        case 'trivia':
            await startTrivia(message);
            break;
            
        case 'joke':
            await tellJoke(message);
            break;
            
        default:
            await message.reply('Unknown command! Use `!help` to see commands.');
    }
});

// Simple trivia game
async function startTrivia(message) {
    // Check if game already active in this channel
    if (activeGames.has(message.channel.id)) {
        return message.reply('A game is already active in this channel!');
    }
    
    try {
        // Call n8n webhook if configured
        let triviaQuestion;
        
        if (process.env.N8N_WEBHOOK_URL) {
            try {
                const response = await axios.post(process.env.N8N_WEBHOOK_URL, {
                    action: 'get_trivia',
                    channel: message.channel.id
                });
                triviaQuestion = response.data;
            } catch (error) {
                console.log('n8n not responding, using local questions');
            }
        }
        
        // Fallback to local questions if n8n fails
        if (!triviaQuestion) {
            const questions = [
                {
                    question: "What is the capital of France?",
                    answer: "paris",
                    options: ["London", "Berlin", "Paris", "Madrid"]
                },
                {
                    question: "What planet is known as the Red Planet?",
                    answer: "mars",
                    options: ["Venus", "Mars", "Jupiter", "Saturn"]
                },
                {
                    question: "Who painted the Mona Lisa?",
                    answer: "leonardo da vinci",
                    options: ["Picasso", "Van Gogh", "Leonardo da Vinci", "Michelangelo"]
                }
            ];
            triviaQuestion = questions[Math.floor(Math.random() * questions.length)];
        }
        
        // Store game state
        activeGames.set(message.channel.id, {
            answer: triviaQuestion.answer.toLowerCase(),
            active: true
        });
        
        // Send trivia question
        const triviaEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🧠 Trivia Time!')
            .setDescription(triviaQuestion.question)
            .addFields(
                { name: 'Options', value: triviaQuestion.options.join('\n'), inline: false }
            )
            .setFooter({ text: 'Type your answer in the chat! You have 30 seconds!' });
        
        await message.reply({ embeds: [triviaEmbed] });
        
        // Set timeout
        setTimeout(() => {
            const game = activeGames.get(message.channel.id);
            if (game && game.active) {
                activeGames.delete(message.channel.id);
                message.channel.send(`⏰ Time's up! The answer was: **${triviaQuestion.answer}**`);
            }
        }, 30000);
        
        // Listen for answers
        const filter = m => !m.author.bot && activeGames.has(message.channel.id);
        const collector = message.channel.createMessageCollector({ filter, time: 30000 });
        
        collector.on('collect', m => {
            const game = activeGames.get(message.channel.id);
            if (game && m.content.toLowerCase() === game.answer) {
                activeGames.delete(message.channel.id);
                collector.stop();
                m.reply(`✅ Correct! Well done ${m.author}! 🎉`);
            }
        });
        
    } catch (error) {
        console.error('Error starting trivia:', error);
        await message.reply('Failed to start trivia game. Please try again!');
    }
}

// Tell a joke
async function tellJoke(message) {
    const jokes = [
        "Why don't scientists trust atoms? Because they make up everything!",
        "Why did the scarecrow win an award? He was outstanding in his field!",
        "Why don't eggs tell jokes? They'd crack each other up!",
        "What do you call a bear with no teeth? A gummy bear!",
        "Why did the math book look so sad? Because it had too many problems!"
    ];
    
    const joke = jokes[Math.floor(Math.random() * jokes.length)];
    
    const jokeEmbed = new EmbedBuilder()
        .setColor(0xFFFF00)
        .setTitle('😄 Here\'s a joke!')
        .setDescription(joke)
        .setTimestamp();
    
    await message.reply({ embeds: [jokeEmbed] });
}

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
