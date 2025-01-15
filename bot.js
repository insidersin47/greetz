const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  AttachmentBuilder,
  ActivityType
} = require("discord.js");
const fs = require("fs");
require("dotenv").config();
const handleWordImageCommand = require("./pics.js");

const express = require("express");

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

const client = new Client( {
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Load server data from a JSON file
let serverData = JSON.parse(fs.readFileSync("serverData.json", "utf8"));

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  updateStatus(client);
});

// Event: When a new member joins
client.on("guildMemberAdd", (member) => {
  const serverId = member.guild.id;
  try {
    // Fetch the server-specific welcome data
    const welcomeMessage = serverData.servers[serverId]?.welcome_message;

    if (welcomeMessage) {
      // Determine the channel to send the message
      const channelId = welcomeMessage.channel;
      const welcomeChannel =
      member.guild.channels.cache.get(channelId) ||
      member.guild.channels.cache.find((ch) => ch.name === "welcome");

      if (welcomeChannel) {
        // Check if the bot has permission to send messages in the channel
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

        // Create and send the welcome message
        let content = welcomeMessage.description
        ? welcomeMessage.description
        .replace("{username}", member.user.username)
        .replace("{user}", `<@${member.user.id}>`): "";

        // Handle image attachment
        if (welcomeMessage.image) {
          const attachment = new AttachmentBuilder(welcomeMessage.image);
          welcomeChannel.send({
            content, files: [attachment]
          });
        } else {
          welcomeChannel.send(content);
        }
      } else {
        console.error("No valid welcome channel found.");
      }
    }
  } catch (err) {
    console.error(err);
  }
});

// Event: Commands to update welcome message settings
client.on("messageCreate", async (message) => {
  try {
   await handleWordImageCommand(message);

    if (!message.content.startsWith(".z")) return;

    const args = message.content.slice(2).trim().split(" ");
    const command = args.shift()?.toLowerCase();
    const serverId = message.guild.id;

    // Ensure server data exists
    if (!serverData.servers[serverId]) {
      serverData.servers[serverId] = {
        welcome_message: {}
      };
    }

    // Check if the user has moderator permissions
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return message.reply("You do not have permission to use this command.");
    }

    const value = args.join(" ");

    switch (command) {
      case "description":
        serverData.servers[serverId].welcome_message.description = value;
        message.reply("Updated the welcome description.");
        break;

      case "image":
        serverData.servers[serverId].welcome_message.image = value;
        message.reply("Updated the welcome image.");
        break;

      case "channel":
        const channel =
        message.mentions.channels.first() ||
        message.guild.channels.cache.get(value);
        if (channel) {
          serverData.servers[serverId].welcome_message.channel = channel.id;
          message.reply(`Welcome messages will now be sent to ${channel}.`);
        } else {
          message.reply("Please mention a valid channel or provide a valid channel ID.");
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

        **Note**: Only moderators can use these commands.`;
        message.reply(helpText);
        break;

      default:
        message.reply("Unknown command. Use `.z help` for a list of commands.");
      }

      // Save updates to JSON file
      fs.writeFileSync("serverData.json", JSON.stringify(serverData, null, 2));
    } catch (err) {
      console.error(err);
    }
  });

  function updateStatus(client) {
    let toggle = true; // Flag to switch between server count and member count

    setInterval(() => {
      const guildCount = client.guilds.cache.size || 32;
      let totalMembers = 0;

      client.guilds.cache.forEach(guild => {
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

      toggle = !toggle; // Toggle the flag to switch activities
    },
      6000); // Update every 60 seconds (1 minute)
  }

  // Log in to Discord
  client.login(process.env.BOT_TOKEN);
