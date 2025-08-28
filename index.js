// index.js - Discord Game Bot
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

// In-memory game storage
const activeGames = new Map();

// When bot is ready
client.once('ready', () => {
    console.log(`✅ Bot is online as ${client.user.tag}`);
    client.user.setActivity('!help for commands');

    if (process.env.N8N_WEBHOOK_URL) {
        console.log('📡 n8n webhook configured:', process.env.N8N_WEBHOOK_URL);
    }
});

// Handle incoming messages
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    switch (command) {
        case 'help':
            const helpEmbed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('🎮 Game Bot Commands')
                .setDescription('Available commands:')
                .addFields(
                    { name: '!help', value: 'Show this menu' },
                    { name: '!ping', value: 'Check bot status' },
                    { name: '!trivia', value: 'Start a trivia game' },
                    { name: '!joke', value: 'Get a random joke' }
                );
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
            await message.reply('❓ Unknown command! Use `!help`');
    }
});

// Trivia Game
async function startTrivia(message) {
    if (activeGames.has(message.channel.id)) {
        return message.reply('⚠️ A game is already active in this channel!');
    }

    let triviaData;

    // Try fetching from n8n
    if (process.env.N8N_WEBHOOK_URL) {
        try {
            const response = await axios.post(process.env.N8N_WEBHOOK_URL, {
                action: 'get_trivia',
                channel_id: message.channel.id,
                user_id: message.author.id,
                username: message.author.username,
                message_id: message.id
            });
            triviaData = response.data;
            console.log('✅ Got trivia from n8n');
        } catch (error) {
            console.log('❌ n8n error, using local trivia');
        }
    }

    // Fallback to local questions
    if (!triviaData) {
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
            }
        ];
        triviaData = questions[Math.floor(Math.random() * questions.length)];
    }

    // Store game state
    activeGames.set(message.channel.id, {
        answer: triviaData.answer.toLowerCase(),
        active: true
    });

    // Send trivia question
    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🧠 Trivia Time!')
        .setDescription(triviaData.question)
        .addFields({ name: 'Options', value: triviaData.options.join('\n') })
        .setFooter({ text: 'Type your answer! 30 seconds!' });

    await message.reply({ embeds: [embed] });

    // Timeout after 30 seconds
    setTimeout(() => {
        if (activeGames.has(message.channel.id)) {
            activeGames.delete(message.channel.id);
            message.channel.send(`⏰ Time's up! The answer was: **${triviaData.answer}**`);
        }
    }, 30000);

    // Collect user answers
    const filter = m => !m.author.bot;
    const collector = message.channel.createMessageCollector({ filter, time: 30000 });

    collector.on('collect', m => {
        const game = activeGames.get(message.channel.id);
        if (game && m.content.toLowerCase() === game.answer) {
            activeGames.delete(message.channel.id);
            collector.stop();
            m.reply(`✅ Correct! Well done, ${m.author}! 🎉`);
        }
    });
}

// Joke Command
async function tellJoke(message) {
    let jokeText;

    // Try n8n first
    if (process.env.N8N_WEBHOOK_URL) {
        try {
            const response = await axios.post(process.env.N8N_WEBHOOK_URL, {
                action: 'get_joke',
                channel_id: message.channel.id,
                user_id: message.author.id,
                username: message.author.username,
                message_id: message.id
            });
            jokeText = response.data.joke;
            console.log('✅ Got joke from n8n');
        } catch (error) {
            console.log('❌ n8n error, using local joke');
        }
    }

    // Fallback
    if (!jokeText) {
        const jokes = [
            "Why don't scientists trust atoms? Because they make up everything!",
            "Why did the scarecrow win an award? He was outstanding in his field!"
        ];
        jokeText = jokes[Math.floor(Math.random() * jokes.length)];
    }

    const embed = new EmbedBuilder()
        .setColor(0xFFFF00)
        .setTitle('😄 Joke!')
        .setDescription(jokeText);

    await message.reply({ embeds: [embed] });
}

// Login
console.log('🚀 Starting bot...');
client.login(process.env.DISCORD_TOKEN);
