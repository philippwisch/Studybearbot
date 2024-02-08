
const https = require('https')
const { Client, Events, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { Student } = require('./student.js');
const { load, save } = require('./io.js');
const { timeFormat, uwufiy } = require('./misc.js');
require('dotenv').config();

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// SERVER CONFIG                                                                                                                        //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const LOGIN_TOKEN = process.env.LOGIN_TOKEN;
const STUDY_CHANNEL_ID = process.env.STUDY_CHANNEL_ID;
const GUILD_ID = process.env.GUILD_ID;

const COMMAND_PREFIX = '!';
const REWARD_COST_SECONDS = 10 * 1000 * 60; // cost is 10 gems
const REWARD_COST_GEMS = 10;
const CURRENCY_NAME = 'Grizzly Gems';

let students;

function getStudent(id) {
    return students.find(student => id === student.id)
}

function getStudentBalance(id) {
    let balance = 0;
    const student = getStudent(id);
    if (student) { balance = student.balance }
    return Math.floor(balance / (1000 * 60)); // 1 earned every munute
}

function startInterval() {
    // every 1 second update study times for people currently studying
    // this basically "remembers" what people were in the voicechannel on the last cycle/second
    // by checking the student.seenRecentlyAtTime property

    // (using time calculations with Date.Now() for increased accuracy might be a bit overkill)
    // Also in case the bot goes offline, the seenRecentlyAtTime property will still be set.
    // The bot will then "optimistically" assume, that people who were in the voice chat when the bot went offline
    // and are still in the channel after the bot comes back online have stayed in the vc the whole time.
    // This assumes that the bot is highly available and thus downtimes will be short.
    // This optimistic attribution is capped at 5 minutes
    setInterval(() => {
        students.forEach(student => {
            // student.isStudying is what gets changed when a user joins or leaves the voicechannel
            if (student.isStudying) {
                const currentTime = Date.now();

                // if bot online: if the student has been here for the last check (last second), attribute them 1 second of study time
                // if the bot was offline and just got online again:
                // if the student was in the voice chat when it went offline and was in the voice chat when it came back online again,
                // attribute them up to 5 minutes of study time
                if (student.seenRecentlyAtTime) {
                    let studyTime = currentTime - student.seenRecentlyAtTime;
                    const fiveMins = 5 * 60 * 1000;
                    if (studyTime > fiveMins) { studyTime = fiveMins; }
                    student.totalTime += studyTime;
                    student.balance += studyTime;
                }
                student.seenRecentlyAtTime = currentTime;
                // student stopped studying in that second, so set this to null to stop attributing them study time
            } else { student.seenRecentlyAtTime = null; }
        })
        save(students);
    }, 1000);
}

async function populateGuildMemberCache() {
    const guild = client.guilds.cache.get(GUILD_ID);
    try {
        // Fetch all members in the guild to ensure the cache is populated
        await guild.members.fetch();
        console.log('Guild members cache has been populated.');
    } catch (error) {
        console.error(`Error fetching members: ${error.message}`);
    }
}

// accepts a callback function that is run after the url is ready
function getImageURL(callback) {
    let url;

    // This API call will retrieve a URL for a cat picture
    https.get('https://api.thecatapi.com/v1/images/search', resp => {
        let data = "";

        // A chunk of data has been recieved.
        resp.on("data", chunk => {
            data += chunk;
        });

        // The whole response has been received.
        resp.on("end", () => {
            data = JSON.parse(data);

            // return the url for the cat picture, discard other info
            url = data[0]['url'];
            callback(url);
        });
    })
        .on("error", err => {
            console.log("Error: " + err.message);
        });
    return url;
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// CODE THAT RUNS ON STARTUP HERE                                                                                                       //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// load saved data on startup
students = load();
if (!students) { students = [] };

// Discord login for the bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

client.login(LOGIN_TOKEN);

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// EVENT HANDLERS                                                                                                                       //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// when the bot connected to discord:
client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);

    // Member Cache does not guarantee to be fully populated
    // This becomes problematic when a member sends a message
    // with the "/leaderboard" command because members that haven't taken
    // any actions like writing messages or joining voice chats
    // won't be in the cache thus it's impossible to retrieve their username from cache
    // and the leaderboard has to fall back to displaying their id
    populateGuildMemberCache();

    // on startup: check who is currently studying and update students

    // first set everyone to "not studying"
    students.forEach(student => {
        student.isStudying = false;
    })

    // then change status for everyone that is currently studying to "studying"
    const studyChannel = readyClient.channels.cache.get(STUDY_CHANNEL_ID);

    if (studyChannel) {
        const studyMembers = studyChannel.members;
        studyMembers.forEach(member => {
            const student = getStudent(member.id);
            // if this user does not exist, create a new one
            if (!student) {
                students.push(new Student(member.id),)
            } else {
                student.isStudying = true;
            }
        })
    } else {
        console.error('Study voice channel not found or is not a voice channel.');
    }

    // finally start the setInterval function for updating and saving data
    startInterval();
});

// Send Messages when people join study channel
client.on('voiceStateUpdate', (oldState, newState) => {
    let vcChanged = !(oldState.channelId === newState.channelId) // if user changed voice channel
    if (vcChanged && (newState.channelId === STUDY_CHANNEL_ID)) {          // if user changed into study channel
        const voiceChannel = newState.guild.channels.cache.get(STUDY_CHANNEL_ID)

        let msg = "";
        let index = 0;
        let memberCount = voiceChannel.members.size;

        voiceChannel.members.forEach((member) => {
            if (memberCount === 1) {
                msg = uwufiy(`${member.user.tag} is now studybearing! Come and join`);
            } else {
                if (index < memberCount - 1) {
                    msg += member.user.tag + ", ";
                } else {
                    msg += uwufiy(`and ${member.user.tag} are now studybearing! Come and join`);
                }
            }
            index++;
        })
        // Send DMs to all server members
        newState.guild.members.cache.forEach(async member => {
            if (
                // don't message this bot
                member.id != client.user.id
                // only message people that are not already in this voice channel                            
                && (!member.voice.channel || member.voice.channel.id != STUDY_CHANNEL_ID)
            ) {
                try {
                    await member.send(msg);
                } catch (error) {
                    console.error(`Failed to send a direct message to ${member.user.tag}: ${error.message}`);
                }
            }
        })
    }
});

// track users' study times
client.on('voiceStateUpdate', (oldState, newState) => {
    // user joined study channel
    if (newState.channelId === STUDY_CHANNEL_ID) {
        const student = getStudent(newState.member.id);
        // if this user does not exist, create a new one
        if (!student) {
            students.push(new Student(newState.member.id),)
        } else {
            student.isStudying = true;
        }
    }

    // user left study channel
    if (oldState.channelId === STUDY_CHANNEL_ID
        && newState.channelId != STUDY_CHANNEL_ID) {
        const student = getStudent(oldState.member.id);
        if (student) { student.isStudying = false; }
    }
})

// command handler
client.on('messageCreate', async (message) => {
    if (message.content.length < 2 || !message.content.startsWith(COMMAND_PREFIX) || message.author.bot) {
        return
    }
    const sendMessage = function (botMessage) {
        message.channel.send(uwufiy(botMessage));
    }

    let balance, embed;

    const command = message.content.slice(1, message.length)
    switch (command) {
        case 'leaderboard':
        case 'lb':
            if (students.length === 0) {
                sendMessage("The leaderboard is currently empty. Stop slacking, start studying");
                break;
            }
            let position = "", name = "", score = "";
            const leaderboardData = students.sort((a, b) => b.totalTime - a.totalTime);

            leaderboardData.forEach((student, index) => {
                const member = message.guild.members.cache.get(student.id);
                // as a fallback just show the id
                const username = member ? member.user.username : student.id;
                position += index + 1 + '\n';
                name += username + '\n';
                score += timeFormat(student.totalTime / 1000) + '\n';
            });

            embed = new EmbedBuilder()
                .setColor('00ff00')
                .setTitle('Leaderboard')
                .addFields(
                    { name: 'Rank', value: position, inline: true },
                    { name: 'Name', value: name, inline: true },
                    { name: 'Studied for', value: score, inline: true },
                );
            sendMessage({ embeds: [embed] });
            break;
        case 'balance':
        case 'b':
            balance = getStudentBalance(message.author.id)
            sendMessage(`Your current Balance is ${balance} ${CURRENCY_NAME}`);
            break;
        case 'redeem':
        case 'r':
            balance = getStudentBalance(message.author.id)

            // student does not have enough currency to redeem a reward
            if (balance < REWARD_COST_GEMS) {
                sendMessage(`You only have ${balance} ${CURRENCY_NAME}. a cat picture is ${REWARD_COST_GEMS} ${CURRENCY_NAME}. Do the math`);
                break;

            } else { // student has enough
                // pay the price
                getStudent(message.author.id).balance -= REWARD_COST_SECONDS;

                // get the reward
                try {
                    getImageURL((url) => message.channel.send(url));
                } catch (error) {
                    console.error(`Failed to fetch image url: ${error.message}`);
                }
            }

            break;
        case 'info':
        case 'i':
            sendMessage(`
            Hewwo, I am Studybear! I diligently keep track of how much time you spend in my study channel that is for STUDYBEARING ONLY. I will also message you when your fwiends are studying! :3 Studying also earns you very grizzly Grizzly Gems, that you can redeem for awesome... rewards! If you want to see a list of my commands, type !h or !help`);
            break;
        default: // show usage/help
            embed = new EmbedBuilder()
                .setColor('00ffff')
                .setTitle('Usage')
                .addFields(
                    { name: '!info, !i', value: "Displays an information message for how this bot works" },
                    { name: '!leaderboard, !lb', value: "Shows current rankings" },
                    { name: '!balance, !b', value: "Shows how many Grizzly Gems you own" },
                    { name: '!redeem, !r', value: `Redeem ${REWARD_COST_GEMS} of your hard earned Grizzly Gems for an ABSOLUTELY UNBELIEVABLY INSANE REWARD` },
                );
            sendMessage({ embeds: [embed] });
    }
})
