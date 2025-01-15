const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  AttachmentBuilder,
  ActivityType
} = require("discord.js");
const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();

const handleWordImageCommand = require("./pics.js");
const ServerConfig = require("./models/ServerConfig.js");

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
client.on("messageCreate", async (message) => {
  // First, handle the word-image command
  await handleWordImageCommand(message);

  if (!message.content.startsWith(".z")) return;

  const args = message.content.slice(2).trim().split(" ");
  const command = args.shift()?.toLowerCase();
  const serverId = message.guild.id;

  // Check if the user has moderator permissions
  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return message.reply("You do not have permission to use this command.");
  }

  // Attempt to fetch or create a ServerConfig document for this guild
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
        const channel =
        message.mentions.channels.first() ||
        message.guild.channels.cache.get(value);
        if (channel) {
          serverConfig.welcome_message.channel = channel.id;
          await serverConfig.save();
          message.reply(`Welcome messages will now be sent to ${channel}.`);
        } else {
          message.reply(
            "Please mention a valid channel or provide a valid channel ID."
          );
        }
      }
      break;

    case "help":
      const helpText = `
      **Bot Commands**
      - \`.z description <new description>\`: Update the description of the welcome message.
      - \`.z image <url>\`: Update the image of the welcome message.
      - \`.z channel <#channel>\`: Set the channel for welcome messages.

      **Placeholders**
      \`{username}\`: The new user's name.
      \`{user}\`: Mention the new user.

      **Note**: Only moderators can use these commands.
      `;
      message.reply(helpText);
      break;

    default:
      message.reply("Unknown command. Use `.z help` for a list of commands.");
    }
  });

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