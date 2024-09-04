const axios = require("axios");
const { randomUUID } = require("crypto");
const path = require("path");
const fs = require("fs");
const Key = require("../models/Key");
const { sendBypassAttemptWebhook } = require("../cron/discordWebhookSender");

const randomString = require("../utils/generateRandomString");
const monetizeLink = require("../utils/monetizeLink");
const logger = require("../utils/logger");
const {
  sendLinkCreatedWebhook,
  sendLinkCompletedWebhook,
} = require("../utils/linkswebhooks");

const BASE_URL = process.env.BASE_URL;
const LINKVERTISE_ID = process.env.LINKVERTISE_ID;
const LOOTLABS_API_TOKEN = process.env.LOOTLABS_API_TOKEN;
const LOOTLABS_API_URL = "https://be.lootlabs.gg/api/lootlabs/content_locker";

const DAY_IN_MS = 86400000;
const MIN_WAIT = 15000;
const TOTAL_TURNS = 2; // 1 Linkvertise + 1 LootLabs

const activeLinks = {};

// ... (keep other utility functions like formatDuration, logLinkUsage, etc.)

async function createLinkvertiseLink(checkoutKey) {
  try {
    return monetizeLink(
      LINKVERTISE_ID,
      `${BASE_URL}/link/chained/${checkoutKey}`
    );
  } catch (e) {
    logger.error("Error in createLinkvertiseLink:", e);
    return null;
  }
}

async function createLootLabsLink(checkoutKey, step) {
  try {
    const lootLabsData = {
      title: `Key Generator - Step ${step}`,
      url: `${BASE_URL}/link/chained/${checkoutKey}`,
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
      return response.data.message[0].loot_url;
    } else {
      logger.error("Unexpected response from LootLabs API:", response.data);
      return null;
    }
  } catch (error) {
    logger.error("Error in createLootLabsLink:", error);
    return null;
  }
}

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
      const checkoutKey = randomString(32);
      const trackid = randomString(12);
      const url = await createLinkvertiseLink(checkoutKey);

      if (url) {
        activeLinks[checkoutKey] = {
          trackid,
          turns: TOTAL_TURNS,
          expire: Date.now() + DAY_IN_MS,
          created: Date.now(),
        };

        await sendLinkCreatedWebhook({
          checkoutKey,
          turns: TOTAL_TURNS,
          trackid,
        });
        res.redirect(url);
      } else {
        console.error("Error: url is undefined after createLinkvertiseLink");
        res.redirect(`${BASE_URL}/link/create`);
      }
    } catch (error) {
      console.error("Error in /create-with-type route:", error);
      res
        .status(500)
        .send("An error occurred while creating the chained link.");
    }
  },

  checkoutKey: async (req, res) => {
    const { checkoutKey } = req.params;
    const linkInfo = activeLinks[checkoutKey];

    if (!linkInfo) {
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
    if (turnsLeft === 2) {
      // This is the first visit, redirect to LootLabs
      const url = await createLootLabsLink(checkoutKey, 2);
      if (url) {
        activeLinks[checkoutKey].turns = 1;
        return res.redirect(url);
      } else {
        console.error("Error: url is undefined after createLootLabsLink");
        return res.redirect(`${BASE_URL}/link/create`);
      }
    } else if (turnsLeft === 1) {
      // This is the second visit, generate the key
      try {
        const newKey = await createAndSaveNewKey();
        await sendWebhookAndRenderResult(req, res, newKey, linkInfo);
        delete activeLinks[checkoutKey];
      } catch (error) {
        console.error("Error in final key generation:", error);
        res.status(500).send("An error occurred while generating your key.");
      }
    } else {
      console.error("Invalid turns left for checkoutKey:", checkoutKey);
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
    res.json({ message: `Deleted ${count} active chained links` });
  },

  getAnalytics: (req, res) => {
    const analytics = generateAnalytics();
    res.json(analytics);
  },
};

function createAndSaveNewKey() {
  const newKey = new Key({
    id: randomUUID(),
    type: "free",
    value: randomString(12),
  });
  return newKey.save();
}

async function sendWebhookAndRenderResult(req, res, newKey, linkInfo) {
  const endTime = Date.now();
  const duration = endTime - linkInfo.created;
  const formattedDuration = formatDuration(duration);
  const webhookData = {
    key: newKey.value,
    type: newKey.type,
    duration: formattedDuration,
    link: req.originalUrl,
  };
  await sendLinkCompletedWebhook(webhookData);
  const htmlFilePath = path.join(__dirname, "html", "resultKey.html");
  let htmlContent = fs.readFileSync(htmlFilePath, "utf8");
  htmlContent = htmlContent.replace("${userKey}", newKey.value);
  res.send(htmlContent);
}

function formatDuration(ms) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);

  return (
    [
      hours > 0 && `${hours}h`,
      minutes > 0 && `${minutes}m`,
      seconds > 0 && `${seconds}s`,
    ]
      .filter(Boolean)
      .join(" ") || "0s"
  );
}

function logLinkUsage(checkoutKey) {
  logger.info(
    `Chained link used: ${checkoutKey} at ${new Date().toISOString()}`
  );
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
    totalActiveChainedLinks: totalLinks,
    chainedLinksExpiringWithinHour: expiringSoon,
    oldestChainedLinkAge: Date.now() - oldestLink,
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
  logger.info(`Cleaned up ${deletedCount} expired chained links`);
}

// Run cleanup every hour
setInterval(cleanupActiveLinks, 3600000);
