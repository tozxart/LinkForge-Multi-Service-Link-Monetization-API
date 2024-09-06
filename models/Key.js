const mongoose = require("mongoose");

const keySchema = new mongoose.Schema({
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
    enum: ["free", "paid"],
  },
  duration: {
    type: Number,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Key", keySchema);
