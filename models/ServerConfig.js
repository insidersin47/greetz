import mongoose from "mongoose";

const RuleSchema = new mongoose.Schema({
  ruleNo: {
    type: Number,
    required: true,
  },
  // Now storing description instead of an image URL
  description: {
    type: String,
    required: true,
  },
});

const AboutSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
});

const WordImageSchema = new mongoose.Schema({
  word: {
    type: String,
    required: true,
  },
  url: {
    type: String,
    required: true,
  },
});

const WelcomeMessageSchema = new mongoose.Schema({
  channel: {
    type: String, default: ""
    },
    description: {
      type: String, default: ""
    },
    image: {
      type: String, default: ""
    },
  });

  // Each server (guild) in Discord is one document
  const ServerConfigSchema = new mongoose.Schema({
    serverId: {
      type: String,
      required: true,
      unique: true,
    },
    welcome_message: {
      type: WelcomeMessageSchema,
    default: () => ({}),
    },
    rules: {
      type: [RuleSchema],
    default: [],
    },
    about: {
      type: [AboutSchema],
    default: [],
    },
    wordImages: {
      type: [WordImageSchema],
    default: [],
    },
    ai_channel: {
      type: String, default: ""
    }
  });

  export default mongoose.model("ServerConfig", ServerConfigSchema);