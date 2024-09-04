const axios = require("axios");
const { randomUUID } = require("crypto");
const Key = require("../models/Key");
const { sendBypassAttemptWebhook } = require("../cron/discordWebhookSender");

const BASE_URL = process.env.BASE_URL;
const LOOTLABS_API_TOKEN = process.env.LOOTLABS_API_TOKEN;
const LOOTLABS_API_URL = "https://be.lootlabs.gg/api/lootlabs/content_locker";

const DAY_IN_MS = 86400000;
const MIN_WAIT = 15000;
const TURNS = 2;

const activeLinks = {};

const fs = require("fs");
const path = require("path");

const logger = require("../utils/logger");
const {
  sendLinkCreatedWebhook,
  sendLinkCompletedWebhook,
} = require("../utils/linkswebhooks");

module.exports = {
  create: async (req, res) => {
    try {
      res.sendFile(path.join(__dirname, "html", "GenerateLinks.html"));
    } catch (error) {
      console.error("Error in /create route:", error);
      res.status(500).send("An error occurred while creating the link.");
    }
  },

  createWithType: async (req, res) => {
    try {
      if (!LOOTLABS_API_TOKEN) {
        throw new Error(
          "LOOTLABS_API_TOKEN is not set in the environment variables"
        );
      }

      const checkoutKey = randomString(32);
      const trackid = randomString(12);

      const lootLabsData = {
        title: "Key Generator - Step 1",
        url: `${BASE_URL}/link/lootlabs/${checkoutKey}`,
        tier_id: 1,
        number_of_tasks: 3,
        theme: 1,
      };

      const response = await axios.post(LOOTLABS_API_URL, lootLabsData, {
        headers: { Authorization: `Bearer ${LOOTLABS_API_TOKEN}` },
      });

      if (
        response.data &&
        response.data.type === "created" &&
        response.data.message &&
        Array.isArray(response.data.message) &&
        response.data.message.length > 0 &&
        response.data.message[0].loot_url
      ) {
        const lootUrl = response.data.message[0].loot_url;

        // Store the link information
        activeLinks[checkoutKey] = {
          trackid,
          turns: TURNS,
          expire: Date.now() + DAY_IN_MS,
          created: Date.now(),
        };

        // Send webhook for link creation
        await sendLinkCreatedWebhook({ checkoutKey, turns: TURNS, trackid });

        res.redirect(lootUrl);
      } else {
        logger.error("Unexpected response from LootLabs API:", response.data);
        res.redirect(`${BASE_URL}/link/create`);
      }
    } catch (error) {
      logger.error("Error in LootLabs /create-with-type route:", error.message);
      if (error.response) {
        logger.error("API response status:", error.response.status);
        logger.error("API response data:", error.response.data);
      }
      res
        .status(500)
        .send(
          "An error occurred while processing the LootLabs link. Please try again later."
        );
    }
  },

  checkoutKey: async (req, res) => {
    const { checkoutKey } = req.params;
    logger.info(
      "Accessed LootLabs checkoutKey function with key:",
      checkoutKey
    );

    const linkInfo = activeLinks[checkoutKey];

    if (!linkInfo) {
      logger.error("Cannot find linkinfo for checkoutKey:", checkoutKey);
      return res.redirect(`${BASE_URL}/link/create`);
    }

    if (linkInfo.created + MIN_WAIT > Date.now()) {
      await sendBypassAttemptWebhook({ checkoutKey, ip: req.ip });
      Object.keys(activeLinks).forEach((key) => delete activeLinks[key]);
      const htmlFilePath = path.join(__dirname, "./html/Bypass.html");
      const htmlContent = fs.readFileSync(htmlFilePath, "utf8");
      return res.send(htmlContent);
    }

    logLinkUsage(checkoutKey);

    const turnsLeft = linkInfo.turns;
    if (turnsLeft > 1) {
      // Create the second LootLabs link
      const secondLootLabsData = {
        title: "Key Generator - Step 2",
        url: `${BASE_URL}/link/lootlabs/${checkoutKey}`,
        tier_id: 1,
        number_of_tasks: 3,
        theme: 1,
      };

      const response = await axios.post(LOOTLABS_API_URL, secondLootLabsData, {
        headers: { Authorization: `Bearer ${LOOTLABS_API_TOKEN}` },
      });

      if (
        response.data &&
        response.data.type === "created" &&
        response.data.message &&
        Array.isArray(response.data.message) &&
        response.data.message.length > 0 &&
        response.data.message[0].loot_url
      ) {
        const secondLootUrl = response.data.message[0].loot_url;

        // Update the turns left in the activeLinks object
        activeLinks[checkoutKey].turns = turnsLeft - 1;
        res.redirect(secondLootUrl);
      } else {
        logger.error(
          "Unexpected response from LootLabs API for second link:",
          response.data
        );
        res.redirect(`${BASE_URL}/link/create`);
      }
    } else if (turnsLeft === 1) {
      const newKey = new Key({
        id: randomUUID(),
        type: "free",
        value: randomString(12),
      });

      await newKey.save();

      // Calculate the duration and prepare data for webhook
      const endTime = Date.now();
      const duration = endTime - linkInfo.created;
      const formattedDuration = formatDuration(duration);
      const webhookData = {
        key: newKey.value,
        type: newKey.type,
        duration: formattedDuration,
        link: req.originalUrl,
      };

      // Send data via webhook
      await sendLinkCompletedWebhook(webhookData);

      const htmlFilePath = path.join(__dirname, "html", "resultKey.html");
      let htmlContent = fs.readFileSync(htmlFilePath, "utf8");

      // Replace the placeholder with the actual key
      htmlContent = htmlContent.replace("${userKey}", newKey.value);

      // Send the modified HTML content
      res.send(htmlContent);

      // Delete the link from activeLinks
      delete activeLinks[checkoutKey];
    } else {
      logger.error("Invalid turns left for checkoutKey:", checkoutKey);
      res.redirect(`${BASE_URL}/link/create`);
    }
  },

  getActiveLinksCount: (req, res) => {
    const count = Object.keys(activeLinks).length;
    res.json({ count });
  },

  deleteAllLinks: (req, res) => {
    const count = Object.keys(activeLinks).length;
    Object.keys(activeLinks).forEach((key) => delete activeLinks[key]);
    res.json({ message: `Deleted ${count} active links` });
  },

  getAnalytics: (req, res) => {
    const analytics = generateAnalytics();
    res.json(analytics);
  },

  comingSoon: (req, res) => {
    logger.info("Accessed LootLabs coming soon page");
    res.send("<h1>LootLabs integration coming soon!</h1>");
  },
};

// Helper functions
function randomString(length) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function formatDuration(ms) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);

  const hoursStr = hours > 0 ? `${hours}h ` : "";
  const minutesStr = minutes > 0 ? `${minutes}m ` : "";
  const secondsStr = seconds > 0 ? `${seconds}s` : "";

  return hoursStr + minutesStr + secondsStr || "0s";
}

function logLinkUsage(checkoutKey) {
  logger.info(`Link used: ${checkoutKey} at ${new Date().toISOString()}`);
}

function generateAnalytics() {
  const totalLinks = Object.keys(activeLinks).length;
  const expiringSoon = Object.values(activeLinks).filter(
    (link) => link.expire - Date.now() < 3600000 // expiring in less than an hour
  ).length;
  const oldestLink = Math.min(
    ...Object.values(activeLinks).map((link) => link.created)
  );

  return {
    totalActiveLinks: totalLinks,
    linkExpiringWithinHour: expiringSoon,
    oldestLinkAge: Date.now() - oldestLink,
  };
}

function cleanupActiveLinks() {
  const now = Date.now();
  let deletedCount = 0;
  for (const [key, link] of Object.entries(activeLinks)) {
    if (link.expire < now) {
      delete activeLinks[key];
      deletedCount++;
    }
  }
  logger.info(`Cleaned up ${deletedCount} expired links`);
}

// Run cleanup every hour
setInterval(cleanupActiveLinks, 3600000);
