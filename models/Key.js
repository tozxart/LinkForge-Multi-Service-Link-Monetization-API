const { Schema, model } = require("mongoose");

const keySchema = new Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    value: {
      type: String,
      required: true,
      unique: true,
    },
    type: {
      type: String,
      required: true,
    },
    subscriptionType: {
      type: String,
      required: false,
    },
    // gameId and adIds property are only valid for "type" of "free"
    gameId: {
      type: String,
      required: false,
    },
    adIds: {
      type: Array,
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = model("key", keySchema);
