const axios = require("axios");
const logger = require("./logger");

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_Links_With_Key;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

async function sendWebhook(data, retries = 0) {
  try {
    const response = await axios.post(WEBHOOK_URL, data);
    logger.info("Webhook sent successfully", { status: response.status });
  } catch (error) {
    logger.error("Error sending webhook", {
      error: error.message,
      response: error.response ? error.response.data : null,
    });

    if (retries < MAX_RETRIES) {
      logger.info(`Retrying webhook (${retries + 1}/${MAX_RETRIES})...`);
      setTimeout(() => sendWebhook(data, retries + 1), RETRY_DELAY);
    }
  }
}

module.exports = {
  sendLinkCreatedWebhook: async (data) => {
    await sendWebhook({
      embeds: [
        {
          title: "Link Created",
          color: 5814783, // A nice blue color
          fields: [
            { name: "Checkout Key", value: data.checkoutKey },
            { name: "Track ID", value: data.trackid },
            { name: "Turns", value: data.turns.toString() },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    });
  },

  sendLinkCompletedWebhook: async (data) => {
    await sendWebhook({
      embeds: [
        {
          title: "Link Completed",
          color: 5763719, // A nice green color
          fields: [
            { name: "Key", value: data.key },
            { name: "Type", value: data.type },
            { name: "Duration", value: data.duration },
            { name: "Link", value: data.link },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    });
  },
};
