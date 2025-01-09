const fs = require("fs");
const { PermissionsBitField, AttachmentBuilder } = require("discord.js");

// Load word-to-image mappings
let wordImageMap = JSON.parse(fs.readFileSync("wordImageMap.json", "utf8") || "{}");

function handleWordImageCommand(message) {
  try {
    const args = message.content.slice(2).trim().split(" ");
    const command = args.shift()?.toLowerCase();
    const serverId = message.guild.id;

    // Ensure server data exists
    if (!wordImageMap[serverId]) {
      wordImageMap[serverId] = {};
    }

    switch (command) {
      case "set":
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return message.reply("You do not have permission to set images.");
        }

        const [word, url] = args;
        if (!word || !url) {
          return message.reply("Usage: `px set <word> <url>`");
        }

        // Check if URL is valid
        if (!url.startsWith("http")) {
          return message.reply("Please provide a valid URL.");
        }

        wordImageMap[serverId][word.toLowerCase()] = url;
        fs.writeFileSync("wordImageMap.json", JSON.stringify(wordImageMap, null, 2));
        message.reply(`Image for word \`${word}\` set successfully.`);
        break;

      case "delete":
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return message.reply("You do not have permission to delete images.");
        }

        const deleteWord = args[0]?.toLowerCase();
        if (!deleteWord || !wordImageMap[serverId][deleteWord]) {
          return message.reply("Word not found. Use `px set` to add it first.");
        }

        delete wordImageMap[serverId][deleteWord];
        fs.writeFileSync("wordImageMap.json", JSON.stringify(wordImageMap, null, 2));
        message.reply(`Image for word \`${deleteWord}\` deleted successfully.`);
        break;

      case "help":
        const helpText = `
**px Commands**
- \`px <word>\`: Send the associated image for the word if it exists.
- \`px set <word> <url>\`: Set an image URL for the word (Admins only).
- \`px delete <word>\`: Delete the image URL for the word (Admins only).`;
        message.reply(helpText);
        break;

      default:
        const wordUsed = command.toLowerCase();
        const imageUrl = wordImageMap[serverId][wordUsed];

        if (imageUrl) {
          // Check bot permissions
          if (
            !message.channel
              .permissionsFor(message.guild.members.me)
              ?.has(PermissionsBitField.Flags.SendMessages | PermissionsBitField.Flags.AttachFiles)
          ) {
            return message.reply("I don't have permission to send messages or attachments here.");
          }

          const attachment = new AttachmentBuilder(imageUrl);
          message.channel.send({ content: ``, files: [attachment] });
        } else {
          message.reply(`No image found for the word \`${wordUsed}\`. Use \`px set <word> <url>\` to add one.`);
        }
        break;
    }
  } catch (err) {
    console.error(err);
  }
}

module.exports = handleWordImageCommand;