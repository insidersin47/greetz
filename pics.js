const fs = require("fs");
const {
  PermissionsBitField,
  AttachmentBuilder,
  EmbedBuilder,
} = require("discord.js");

// Load word-to-image mappings
let wordImageMap = {};
try {
  const data = fs.readFileSync("wordImageMap.json", "utf8");
  wordImageMap = JSON.parse(data);
} catch (err) {
  console.error("Could not read wordImageMap.json, starting with an empty object.");
}

function handleWordImageCommand(message) {
  // 1) Check if the message starts with our new prefix
  const prefix = "nami"; 
  if (!message.content.toLowerCase().startsWith(prefix)) return;

  // 2) Parse arguments: remove prefix + any space
  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  const serverId = message.guild?.id;
  if (!serverId) return;

  // Ensure server data structure
  if (!wordImageMap[serverId]) {
    wordImageMap[serverId] = {};
  }
  if (!wordImageMap[serverId].rules) {
    wordImageMap[serverId].rules = {}; // stores ruleNo -> image URL
  }
  if (!wordImageMap[serverId].about) {
    wordImageMap[serverId].about = {}; // stores userId -> description
  }

  // Helper function to save JSON
  function saveData() {
    fs.writeFileSync("wordImageMap.json", JSON.stringify(wordImageMap, null, 2));
  }

  // Check if the member is an admin (for mod-only commands)
  function isAdmin(member) {
    return member.permissions.has(PermissionsBitField.Flags.Administrator);
  }

  try {
    /********************************************************
     *                   SPECIAL CASE: RULE                 *
     *  1) nami set rule <ruleNo> <image URL> (Admins only) *
     *  2) nami rule <ruleNo>                               *
     *  3) nami rule <ruleNo> delete (Admins only)          *
     ********************************************************/
    if (command === "set" && args[0]?.toLowerCase() === "rule") {
      // e.g. nami set rule 2 http://image.com/img.jpg
      if (!isAdmin(message.member)) {
        return message.reply("You do not have permission to set rules.");
      }

      const ruleNo = args[1];
      const imageUrl = args[2];

      if (!ruleNo || !imageUrl) {
        return message.reply("Usage: `nami set rule <ruleNo> <imageURL>`");
      }
      if (!imageUrl.startsWith("http")) {
        return message.reply("Please provide a valid URL for the rule image.");
      }

      wordImageMap[serverId].rules[ruleNo] = imageUrl;
      saveData();
      return message.reply(`Rule #${ruleNo} image set successfully.`);
    }

    if (command === "rule") {
      // Could be either: nami rule <ruleNo> OR nami rule <ruleNo> delete
      const ruleNo = args[0];
      if (!ruleNo) {
        return message.reply("Please specify a rule number. `nami rule <ruleNo>`");
      }

      // Check if "delete" sub-command
      if (args[1]?.toLowerCase() === "delete") {
        // e.g. nami rule 2 delete
        if (!isAdmin(message.member)) {
          return message.reply("You do not have permission to delete rules.");
        }

        if (!wordImageMap[serverId].rules[ruleNo]) {
          return message.reply(`Rule #${ruleNo} does not exist.`);
        }

        delete wordImageMap[serverId].rules[ruleNo];
        saveData();
        return message.reply(`Rule #${ruleNo} deleted successfully.`);
      }

      // Otherwise, show the rule embed
      const imageUrl = wordImageMap[serverId].rules[ruleNo];
      if (!imageUrl) {
        return message.reply(`Rule #${ruleNo} not found. Use \`nami set rule ${ruleNo} <imageURL>\` to add it.`);
      }

      // Create an embed to display the rule nicely
      const ruleEmbed = new EmbedBuilder()
        .setTitle(`Rule #${ruleNo}`)
        .setImage(imageUrl)
        .setColor("#f31717");

      return message.channel.send({ embeds: [ruleEmbed] });
    }

    /********************************************************
     *                 SPECIAL CASE: ABOUT                  *
     *  1) nami about @user <description> (Admins only)     *
     *  2) nami about @user                                 *
     *  3) nami about @user delete (Admins only)            *
     ********************************************************/
    if (command === "about") {
      // e.g. nami about @someone ...
      const targetMention = args[0];
      if (!targetMention) {
        return message.reply("Usage: `nami about @user [description|delete]`");
      }

      // Extract user ID from mention (e.g. <@123456789>)
      const userIdMatch = targetMention.match(/^<@!?(\d+)>$/);
      if (!userIdMatch) {
        return message.reply("Please mention a valid user: `nami about @user ...`");
      }
      const targetUserId = userIdMatch[1];

      // sub-command could be 'delete' or a description
      const subCommandOrDesc = args.slice(1).join(" ");

      // 3) delete
      if (subCommandOrDesc.toLowerCase() === "delete") {
        if (!isAdmin(message.member)) {
          return message.reply("You do not have permission to delete user 'about' info.");
        }
        if (!wordImageMap[serverId].about[targetUserId]) {
          return message.reply("That user doesn't have an 'about' info set.");
        }
        delete wordImageMap[serverId].about[targetUserId];
        saveData();
        return message.reply("User 'about' info deleted successfully.");
      }

      // 2) check if about @user with no description => show embed
      if (!subCommandOrDesc) {
        const existingAbout = wordImageMap[serverId].about[targetUserId];
        if (!existingAbout) {
          return message.reply("No 'about' info found for that user.");
        }

        // Build an embed with user info
        const user = message.guild.members.cache.get(targetUserId)?.user;
        const username = user ? user.username : `UserID: ${targetUserId}`;
        const aboutEmbed = new EmbedBuilder()
          .setTitle(`${username}'𝘴 𝘈𝘣𝘰𝘶𝘵`)
          .setDescription(existingAbout)
          .setColor("#5c7ff6");

        // If we can get the user's avatar
        if (user?.displayAvatarURL()) {
          aboutEmbed.setThumbnail(user.displayAvatarURL());
        }

        return message.channel.send({ embeds: [aboutEmbed] });
      }

      // 1) about @user <description> => set or update (Admins only)
      if (!isAdmin(message.member)) {
        return message.reply("You do not have permission to set user 'about' info.");
      }

      if (subCommandOrDesc.length > 200) {
        return message.reply("The description must be under 200 characters.");
      }

      wordImageMap[serverId].about[targetUserId] = subCommandOrDesc;
      saveData();
      return message.reply(`'About' info updated for <@${targetUserId}>.`);
    }

    /********************************************************
     *                LEGACY CASES (words)                  *
     ********************************************************/
    switch (command) {
      case "set": {
        // e.g. nami set <word> <url>
        // If we got here, it means it's not "set rule", so it's the normal word->url case
        if (!isAdmin(message.member)) {
          return message.reply("You do not have permission to set images.");
        }

        const [word, url] = args;
        if (!word || !url) {
          return message.reply("Usage: `nami set <word> <url>`");
        }

        if (!url.startsWith("http")) {
          return message.reply("Please provide a valid URL.");
        }
        
        if (word.toLowerCase() === "rules" || word.toLowerCase() === "about") {
          return message.reply("The words `rules` and `about` can't be used for an image!");
        }

        wordImageMap[serverId][word.toLowerCase()] = url;
        saveData();
        message.reply(`Image for word \`${word}\` set successfully.`);
        break;
      }

      case "delete": {
        // e.g. nami delete <word>
        if (!isAdmin(message.member)) {
          return message.reply("You do not have permission to delete images.");
        }

        const deleteWord = args[0]?.toLowerCase();
        if (!deleteWord || !wordImageMap[serverId][deleteWord]) {
          return message.reply("Word not found. Use `nami set <word> <url>` to add it first.");
        }

        delete wordImageMap[serverId][deleteWord];
        saveData();
        message.reply(`Image for word \`${deleteWord}\` deleted successfully.`);
        break;
      }

      case "help": {
        const helpText = `
**nami Commands**

**Rule Commands**
- \`nami set rule <ruleNo> <imageURL>\` (Admins only): Set/update rule image
- \`nami rule <ruleNo>\`: Show rule as an embed
- \`nami rule <ruleNo> delete\` (Admins only): Delete a rule

**About Commands**
- \`nami about @user <description>\` (Admins only): Set or update a user’s about info (max 200 chars)
- \`nami about @user\`: Show user’s about info
- \`nami about @user delete\` (Admins only): Remove user’s about info

**Word-Image Commands (Legacy)**
- \`nami <word>\`: Send the associated image
- \`nami set <word> <url>\` (Admins only): Set an image URL for a word
- \`nami delete <word>\` (Admins only): Delete the image URL for a word
        `;
        message.reply(helpText);
        break;
      }

      default: {
        // e.g. nami <word>
        const wordUsed = command.toLowerCase();
        const imageUrl = wordImageMap[serverId][wordUsed];
        

        if (imageUrl && typeof imageUrl === "string" && imageUrl.startsWith('http') && (wordUsed !== "rules" && wordUsed !== "about")) {
          // Check bot permissions
          if (
            !message.channel
              .permissionsFor(message.guild.members.me)
              ?.has(
                PermissionsBitField.Flags.SendMessages |
                  PermissionsBitField.Flags.AttachFiles
              )
          ) {
            return message.reply("I don't have permission to send messages or attachments here.");
          }

          const attachment = new AttachmentBuilder(imageUrl);
          message.channel.send({ content: ` `, files: [attachment] });
        } else {
          message.reply(
            `No image found for the word \`${wordUsed}\`. ` +
              `Use \`nami set <word> <url>\` to add one.`
          );
        }
        break;
      }
    }
  } catch (err) {
    console.error(err);
  }
}

module.exports = handleWordImageCommand;
