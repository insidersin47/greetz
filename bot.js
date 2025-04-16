import './anticrash.js';

import {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  AttachmentBuilder,
  ActivityType
} from "discord.js";

import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import handleWordImageCommand from "./pics.js";
import ServerConfig from "./models/ServerConfig.js";

const app = express();

// Middleware to parse JSON data
app.use(express.json());

// Basic route to check if the server is running
app.get("/", (req, res) => {
  res.send("Hello, the server is running!");
});

// Start the server and listen on port 3000
app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 50, // Increased pool size for higher concurrency
      serverSelectionTimeoutMS: 5000, // Shorter timeout for faster failover
      socketTimeoutMS: 45000, // Socket timeout
      // Consider enabling other optimizations based on your use case
    });
    console.log('MongoDB connected successfully to Atlas!');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1); // Exit process if DB connection fails
  }
};

connectDB();

// Create Discord client
const client = new Client( {
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// When the client is ready
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  updateStatus(client);
});

// Event: When a new member joins
client.on("guildMemberAdd", async (member) => {
  const serverId = member.guild.id;

  try {
    // 1. Fetch server-specific config from the DB
    let serverConfig = await ServerConfig.findOne({
      serverId
    });

    // If there's no config for this server, nothing to do
    if (!serverConfig) return;

    // Grab the welcome data from the DB
    const {
      welcome_message
    } = serverConfig;
    const welcomeChannelId = welcome_message.channel;
    const welcomeDescription = welcome_message.description;
    const welcomeImage = welcome_message.image;

    // 2. Determine the channel to send the message
    const welcomeChannel =
    member.guild.channels.cache.get(welcomeChannelId) ||
    member.guild.channels.cache.find((ch) => ch.name === "welcome");

    if (!welcomeChannel) {
      console.error("No valid welcome channel found.");
      return;
    }

    // 3. Check if the bot has permission to send messages in that channel
    if (
      !welcomeChannel
      .permissionsFor(member.guild.members.me)
      ?.has(PermissionsBitField.Flags.SendMessages)
    ) {
      console.error(
        "Bot does not have permission to send messages in the welcome channel."
      );
      return;
    }

    // 4. Create and send the welcome message
    let content = "";
    if (welcomeDescription) {
      content = welcomeDescription
      .replace("{username}", member.user.username)
      .replace("{user}", `<@${member.user.id}>`);
    }

    if (welcomeImage) {
      // If you want to attach an image
      const attachment = new AttachmentBuilder(welcomeImage);
      welcomeChannel.send({
        content, files: [attachment]
      });
    } else {
      welcomeChannel.send(content);
    }
  } catch (err) {
    console.error(err);
  }
});

// Event: Commands to update welcome message settings
// Message event for commands (existing code)
client.on("messageCreate", async (message) => {
  // First, handle the word-image command
  await handleWordImageCommand(message);

  if (!message.content.startsWith(".z")) {
    // If the message is not a command, check for Gemini AI chat triggers
    await handleGeminiChat(message);
  }

  // Existing command logic starting with ".z" follows here
  if (!message.content.startsWith(".z")) return;

  const args = message.content.slice(2).trim().split(" ");
  const command = args.shift()?.toLowerCase();
  const serverId = message.guild.id;

  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return message.reply("You do not have permission to use this command.");
  }

  // Fetch or create server configuration
  let serverConfig = await ServerConfig.findOne({
    serverId
  });
  if (!serverConfig) {
    serverConfig = new ServerConfig( {
      serverId
    });
  }

  const value = args.join(" ");

  switch (command) {
    case "description":
      serverConfig.welcome_message.description = value;
      await serverConfig.save();
      message.reply("Updated the welcome description.");
      break;

    case "image":
      serverConfig.welcome_message.image = value;
      await serverConfig.save();
      message.reply("Updated the welcome image.");
      break;

    case "channel":
      {
        const channel = message.mentions.channels.first() || message.guild.channels.cache.get(value);
        if (channel) {
          serverConfig.welcome_message.channel = channel.id;
          await serverConfig.save();
          message.reply(`Welcome messages will now be sent to ${channel}.`);
        } else {
          message.reply("Please mention a valid channel or provide a valid channel ID.");
        }
      }
      break;
    case "aichannel":
      // This command expects a channel mention or a channel ID after the command.
      const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]);
      if (channel) {
        serverConfig.ai_channel = channel.id;
        await serverConfig.save();
        message.reply(`AI replying feature has been enabled in ${channel}.`);
      } else {
        message.reply("Please mention a valid channel or provide a valid channel ID for AI replies.");
      }
      break;

    case "help":
      const helpText = "**Bot Commands**\n" +
      "---------------\n" +
      "- `.z description <new description>`: Update the description of the welcome message.\n" +
      "- `.z image <url>`: Update the image of the welcome message.\n" +
      "- `.z channel <#channel>`: Set the channel for welcome messages.\n\n" +
      "- `.z aichannel <#channel>`: Set the channel for AI messages.\n\n" +
      "**Placeholders**\n" +
      "---------------\n" +
      "- `{username}`: The new user's name.\n" +
      "- `{user}`: Mention the new user.\n\n" +
      "**Note**: Only moderators can use these commands.";
      message.reply(helpText);
      break;

    default:
      message.reply("Unknown command. Use `.z help` for a list of commands.");
    }
  });

  // Function to handle Gemini AI chat interaction
  async function handleGeminiChat(message) {
    // Ignore messages from bots
    if (message.author.bot) return;

    const serverId = message.guild.id;
    const serverConfig = await ServerConfig.findOne({
      serverId
    });

    // If a specific AI channel is configured and the message is not from that channel, then ignore it
    if (serverConfig && serverConfig.ai_channel && message.channel.id !== serverConfig.ai_channel) {
      return;
    }

    // Check if the bot is mentioned or the message is a reply to one of the bot's messages
    const isMentioned = message.mentions.has(client.user);
    const isReplyToBot = message.reference && (await message.fetchReference()).author.id === client.user.id;
    
    await message.channel.sendTyping();

    let prompt = ""
    if (message.reference) {
      try {
        const previousMsg = await message.fetchReference();
        if (previousMsg.author.id === client.user.id) {
          prompt += `Nami (from replied message to keep previous chat in mind): ${previousMsg.content}\n`;
        }
      } catch (error) {
        console.error("Error fetching replied message:", error);
      }
    }

    if (!isMentioned && !isReplyToBot) return;

    // Extract the user’s input. You may choose to strip out the bot mention
    const userInput = message.content.replace(/<@!?[\d]+>/g, "").trim();
    if (!userInput) return; // If no content remains, nothing to process

    // Prepare the prompt with the Nami personality. Feel free to adjust the prompt further.
    prompt += `Tum Nami ho from One Piece — smart, sassy, aur strategic. Neeche diye gaye message ka jawab Nami ke style mein do, jisme clever aur empathetic advice ho with a nautical twist. Sath me emojis ka bhi use kro jarrurat padne pe. Apna jawab limited rakho faltu baat nhi. Tum Adult ho.
    \nUser: ${userInput}\nLanguage: Hinglish/Hindi/English (Preferred language: Hindi in English letters, jaise "kaise ho baby?")\nBehaviour: thoda dirty minded, Rizz type.\nGender: Hot sexy attitude female\nNami (sirf dialogue mein bolo, koi scene description nahi):`;

    try {
      const aiResponse = await getGeminiResponse(prompt);
      // Reply with the AI response
      message.reply(aiResponse);
    } catch (error) {
      console.error("Error with Gemini AI response:", error);
      message.reply("Sorry, I ran into an issue processing that message.");
    }
  }

  // Helper function to call Gemini AI API (update endpoint and parameters as needed)
  async function getGeminiResponse(prompt) {
    // process.env.GEMINI_API_KEY
    const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + process.env.GEMINI_API_KEY;
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.5,
          topP: 0.9,
          maxOutputTokens: 150
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    let resp = await response;

    const data = await response.json();
    // Adjust the property below based on the API's response format
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return reply || "I'm not sure how to respond right now!";
  }

  function updateStatus(client) {
    let toggle = true; // Flag to switch between server count and member count

    setInterval(() => {
      const guildCount = client.guilds.cache.size || 32;
      let totalMembers = 0;

      client.guilds.cache.forEach((guild) => {
        totalMembers += guild.memberCount;
      });

      // Alternate between showing server count and member count
      const activity = toggle
      ? {
        name: `${guildCount} special servers`,
        type: ActivityType.Watching,
      }: {
        name: `with ${totalMembers} members`,
        type: ActivityType.Playing,
      };

      client.user.presence.set({
        activities: [activity],
      });

      toggle = !toggle; // Toggle the flag
    },
      60000); // Update every 60 seconds
  }

  // Log in to Discord
  client.login(process.env.BOT_TOKEN);