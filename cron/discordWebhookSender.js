const { WebhookClient, EmbedBuilder } = require("discord.js");
const axios = require("axios");

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
const sendSpamWebhook = async (details) => {
  const webhookUrl = process.env.Discord_Webhook_Spam;
  const logoUrl = process.env.LOGO_URL;

  const payload = {
    username: "The Intruders - Spam Log",
    avatar_url: logoUrl,
    embeds: [
      {
        title: "🚨 Potential Spam Detected",
        color: 0xff4500, // Orange-red color
        fields: [
          { name: "IP Address", value: details.ip || "N/A", inline: true },
          {
            name: "User Agent",
            value: details.userAgent || "N/A",
            inline: false,
          },
          {
            name: "Operating System",
            value: details.os || "N/A",
            inline: true,
          },
          { name: "Browser", value: details.browser || "N/A", inline: true },
          { name: "Device", value: details.device || "N/A", inline: true },
          { name: "Referer", value: details.referer || "N/A", inline: false },
          { name: "Request Path", value: details.path || "N/A", inline: true },
          {
            name: "Request Method",
            value: details.method || "N/A",
            inline: true,
          },
          { name: "Host", value: details.host || "N/A", inline: true },
          { name: "Origin", value: details.origin || "N/A", inline: true },
          {
            name: "Content-Type",
            value: details.contentType || "N/A",
            inline: true,
          },
          { name: "Accept", value: details.accept || "N/A", inline: false },
          {
            name: "Accept-Encoding",
            value: details.acceptEncoding || "N/A",
            inline: true,
          },
          {
            name: "Accept-Language",
            value: details.acceptLanguage || "N/A",
            inline: true,
          },
          { name: "Cookie", value: details.cookie || "N/A", inline: true },
          {
            name: "X-Requested-With",
            value: details.xRequestedWith || "N/A",
            inline: true,
          },
          {
            name: "Authorization",
            value: details.authorization || "N/A",
            inline: true,
          },
          {
            name: "Headers",
            value: details.headers || "N/A",
            inline: false,
          },

          {
            name: "Query Params",
            value: details.query || "N/A",
            inline: false,
          },
          { name: "Body", value: details.body || "N/A", inline: false },
          { name: "Timestamp", value: details.timestamp, inline: false },
        ],
      },
    ],
  };

  try {
    await axios.post(webhookUrl, payload);
  } catch (error) {
    console.error("Error sending spam webhook:", error);
  }
};
module.exports = {
  sendBypassAttemptWebhook,
  sendSpamWebhook,
};
