const { WebhookClient, EmbedBuilder } = require("discord.js");

async function sendBypassAttemptWebhook(data) {
  try {
    const webhook = new WebhookClient({
      url: process.env.Discord_Webhook_Spam,
    });

    const embed = new EmbedBuilder()
      .setTitle("Bypass Attempt Detected")
      .setColor("#FF0000")
      .addFields(
        { name: "Checkout Key", value: data.checkoutKey },
        { name: "IP Address", value: data.ip }
      )
      .setTimestamp();

    await webhook.send({ embeds: [embed] });
  } catch (error) {
    console.error("Error sending bypass attempt webhook:", error);
  }
}

module.exports = {
  sendBypassAttemptWebhook,
};
