const mongoose = require("mongoose");
require("dotenv/config");

(async () => {
  try {
    mongoose.set("strictQuery", false);
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("🤝 Connected to DB.");

    require("./api")();
    require("./cron")();
  } catch (error) {
    throw new Error(
      `There was an error when starting up the application: ${error}`
    );
  }
})();
