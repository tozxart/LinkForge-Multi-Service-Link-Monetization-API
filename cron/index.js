const Key = require("../models/Key");

module.exports = () => {
  const expireKeys = async () => {
    console.log("Checking for expired keys...");
    let keysExpired = 0;
    const keys = await Key.find({ type: "free" });

    for (const key of keys) {
      const keyAgeMs = Date.now() - Date.parse(key.createdAt);
      const isKeyExpired = 8.64e7 - keyAgeMs < 1;

      if (isKeyExpired) {
        const { id, value } = key;
        await Key.findOneAndDelete({ id });
        console.log(`Key "${value}" was expired after 24 hours.`);
        keysExpired++;
      }
    }

    console.log(`${keysExpired} keys were expired.`);
  };

  const runTasks = async () => {
    await expireKeys();
  };

  setTimeout(() => {
    runTasks();
  }, 5000);
  setInterval(runTasks, 1_800_000);
};
