const {
  PermissionsBitField,
  AttachmentBuilder,
  EmbedBuilder,
} = require("discord.js");
const ServerConfig = require("./models/ServerConfig.js");

// Check if the member is an admin (for mod-only commands)
function isAdmin(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

async function handleWordImageCommand(message) {
  // 1) Check if the message starts with our new prefix
  const prefix = "nami";
  if (!message.content.toLowerCase().startsWith(prefix)) return;

  // 2) Parse arguments: remove prefix + any space
  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  // If no guild found (e.g. in a DM), exit
  const serverId = message.guild?.id;
  if (!serverId) return;

  // Attempt to fetch this server’s config; create one if not found
  let config = await ServerConfig.findOne({
    serverId
  });
  if (!config) {
    config = new ServerConfig( {
      serverId
    });
  }

  try {
    /********************************************************
    *                SPECIAL CASE: RULE (DB)              *
    *  1) nami set rule <ruleNo> <description> (Admins)   *
    *  2) nami rule <ruleNo>                              *
    *  3) nami rule <ruleNo> delete (Admins)              *
    ********************************************************/
    if (command === "set" && args[0]?.toLowerCase() === "rule") {
      // e.g. nami set rule 2 This is the description for rule #2
      if (!isAdmin(message.member)) {
        return message.reply("You do not have permission to set rules.");
      }

      // Extract the ruleNo and the remaining args as the description
      const ruleNo = parseInt(args[1], 10);
      if (isNaN(ruleNo)) {
        return message.reply("Please provide a valid rule number, e.g. `nami set rule 1 This is rule #1`.");
      }
      let description = message.content.slice(15);
      if (!description) {
        return message.reply("Please provide a description for this rule.");
      }
      // Find if this ruleNo already exists
      const existingRule = config.rules.find((r) => r.ruleNo === ruleNo);
      if (existingRule) {
        existingRule.description = description;
      } else {
        config.rules.push({
          ruleNo, description
        });
      }

      await config.save();
      return message.reply(`Rule #${ruleNo} set/updated successfully.`);
    }

    if (command === "rule") {
      // Possible usage: nami rule <ruleNo> OR nami rule <ruleNo> delete
      const ruleNo = parseInt(args[0], 10);
      if (isNaN(ruleNo)) {
        return message.reply(
          "Please specify a valid rule number, e.g. `nami rule 1`"
        );
      }

      // Check for "delete"
      if (args[1]?.toLowerCase() === "delete") {
        if (!isAdmin(message.member)) {
          return message.reply("You do not have permission to delete rules.");
        }

        // Filter out this ruleNo
        const oldLength = config.rules.length;
        config.rules = config.rules.filter((r) => r.ruleNo !== ruleNo);

        // Check if anything was deleted
        if (config.rules.length === oldLength) {
          return message.reply(`Rule #${ruleNo} does not exist.`);
        }

        await config.save();
        return message.reply(`Rule #${ruleNo} deleted successfully.`);
      }

      // Otherwise, display the rule
      const foundRule = config.rules.find((r) => r.ruleNo === ruleNo);
      if (!foundRule) {
        return message.reply(
          `Rule #${ruleNo} not found. Use \`nami set rule ${ruleNo} <description>\` to add it.`
        );
      }

      const formattedRules = foundRule.description.split('\n').join('\n');

      // Create an embed with the rule’s description
      const ruleEmbed = new EmbedBuilder()
      .setTitle(`🆁🆄🅻🅴 #${ruleNo}`)
      .setDescription(formattedRules)
      .setFooter({
        text: `ꜰᴏʟʟᴏᴡ ᴛʜᴇ ʀᴜʟᴇꜱ ᴏʀ ꜰᴀᴄᴇ ᴛʜᴇ ᴄᴏɴꜱᴇQᴜᴇɴᴄᴇꜱ!`
      })

      return message.channel.send({
        embeds: [ruleEmbed]
      });
    }

    /********************************************************
    *                 SPECIAL CASE: ABOUT (DB)            *
    *  1) nami about @user <description> (Admins only)    *
    *  2) nami about @user                                *
    *  3) nami about @user delete (Admins only)           *
    ********************************************************/
    if (command === "about") {
      const targetMention = args[0];
      if (!targetMention) {
        return message.reply("Usage: `nami about @user [description|delete]`");
      }

      const userIdMatch = targetMention.match(/^<@!?(\d+)>$/);
      if (!userIdMatch) {
        return message.reply("Please mention a valid user: `nami about @user ...`");
      }
      const targetUserId = userIdMatch[1];
      const subCommandOrDesc = message.content.slice(14 + (targetUserId.length ? targetUserId.length: 0)).trim();

      // 2a) If "delete"
      if (subCommandOrDesc.toLowerCase() === "delete") {
        if (!isAdmin(message.member)) {
          return message.reply("You do not have permission to delete user 'about' info.");
        }
        // Filter out that user
        const oldLength = config.about.length;
        config.about = config.about.filter((a) => a.userId !== targetUserId);

        if (config.about.length === oldLength) {
          return message.reply("No 'about' info found for that user to delete.");
        }
        await config.save();
        return message.reply("User 'about' info deleted successfully.");
      }

      // 2b) If no description -> display
      if (!subCommandOrDesc) {
        const existingAbout = config.about.find((a) => a.userId === targetUserId);
        if (!existingAbout) {
          return message.reply("No 'about' info found for that user.");
        }
        // Build an embed
        const user = message.guild.members.cache.get(targetUserId)?.user;
        const username = user ? user.username: `UserID: ${targetUserId}`;
        const avatarUrl = user ? user.displayAvatarURL({
          dynamic: true
        }): null;

        const aboutEmbed = new EmbedBuilder()
        .setTitle(`𝔸𝔹𝕆𝕌𝕋 ${username}`)
        .setDescription(existingAbout.description)
        .setColor("#516be2")
        .setThumbnail(avatarUrl); // Set the thumbnail to the user's avatar URL

        return message.channel.send({
          embeds: [aboutEmbed]
        });
      }

      // 2c) Otherwise, set or update description (Admins only)
      if (!isAdmin(message.member)) {
        return message.reply("You do not have permission to set user 'about' info.");
      }
      if (subCommandOrDesc.length > 200) {
        return message.reply("The description must be under 200 characters.");
      }

      const existingAbout = config.about.find((a) => a.userId === targetUserId);
      if (existingAbout) {
        existingAbout.description = subCommandOrDesc;
      } else {
        config.about.push({
          userId: targetUserId,
          description: subCommandOrDesc,
        });
      }
      await config.save();

      return message.reply(`'About' info updated for <@${targetUserId}>.`);
    }

    /********************************************************
    *                LEGACY CASES (words) in DB           *
    ********************************************************/
    switch (command) {
      case "set": {
        // e.g. nami set <word> <url>
        // If we got here, it means it's not "set rule", so it's the normal word->url case
        if (!isAdmin(message.member)) {
          return message.reply("You do not have permission to set images.");
        }

        const [word,
          url] = args;
        if (!word || !url) {
          return message.reply("Usage: `nami set <word> <url>`");
        }
        if (!url.startsWith("http")) {
          return message.reply("Please provide a valid URL.");
        }

        // Check if this word already exists in DB
        const existingWord = config.wordImages.find(
          (w) => w.word.toLowerCase() === word.toLowerCase()
        );

        if (existingWord) {
          existingWord.url = url;
        } else {
          config.wordImages.push({
            word: word.toLowerCase(),
            url: url,
          });
        }

        await config.save();
        return message.reply(`Image for word \`${word}\` set successfully.`);
      }

      case "delete": {
          // e.g. nami delete <word>
          if (!isAdmin(message.member)) {
            return message.reply("You do not have permission to delete images.");
          }

          const deleteWord = args[0]?.toLowerCase();
          if (!deleteWord) {
            return message.reply("Usage: `nami delete <word>`");
          }

          const oldLength = config.wordImages.length;
          config.wordImages = config.wordImages.filter(
            (w) => w.word.toLowerCase() !== deleteWord
          );

          if (config.wordImages.length === oldLength) {
            return message.reply(
              `Word \`${deleteWord}\` not found. Use \`nami set <word> <url>\` to add it first.`
            );
          }

          await config.save();
          return message.reply(`Image for word \`${deleteWord}\` deleted successfully.`);
        }

      case "help": {
          const helpText = `
          **nami Commands**

          **Rule Commands**
          - \`nami set rule <ruleNo> <description>\` (Admins only): Set/update rule description
          - \`nami rule <ruleNo>\`: Show rule description in an embed
          - \`nami rule <ruleNo> delete\` (Admins only): Delete a rule

          **About Commands**
          - \`nami about @user <description>\` (Admins only): Set or update a user’s "about" info (max 200 chars)
          - \`nami about @user\`: Show a user’s "about" info
          - \`nami about @user delete\` (Admins only): Remove a user’s "about" info

          **Word-Image Commands (Legacy)**
          - \`nami <word>\`: Send the associated image
          - \`nami set <word> <url>\` (Admins only): Set an image URL for a word
          - \`nami delete <word>\` (Admins only): Delete the image URL for a word
          `;
          return message.reply(helpText);
        }

      default: {
          // e.g. nami <word>
          const wordUsed = command.toLowerCase();

          // Check if there's a DB entry for that word
          const foundEntry = config.wordImages.find(
            (w) => w.word.toLowerCase() === wordUsed
          );

          if (
            foundEntry &&
            typeof foundEntry.url === "string" &&
            foundEntry.url.startsWith("http")
          ) {
            // Check bot permissions
            if (
              !message.channel
              .permissionsFor(message.guild.members.me)
              ?.has(
                PermissionsBitField.Flags.SendMessages |
                PermissionsBitField.Flags.AttachFiles
              )
            ) {
              return message.reply(
                "I don't have permission to send messages or attachments here."
              );
            }

            // Send the attachment
            const attachment = new AttachmentBuilder(foundEntry.url);
            return message.channel.send({
              content: ` `,
              files: [attachment],
            });
          } else {
            return message.reply(
              `No image found for the word \`${wordUsed}\`. ` +
              `Use \`nami set <word> <url>\` to add one.`
            );
          }
        }
    }
  } catch (err) {
    console.error(err);
    return message.reply("An error occurred while processing your command.");
  } finally {
    // Always save any changes to the config if needed
    // (Though we've already saved in each case above, it's good practice
    //  to ensure we don't lose changes on an error, etc.)
    try {
      await config.save();
    } catch (saveErr) {
      console.error("Error saving config:", saveErr);
    }
  }
}

module.exports = handleWordImageCommand;