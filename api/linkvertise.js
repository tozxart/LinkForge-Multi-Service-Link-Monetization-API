const { randomUUID } = require("crypto");
const path = require("path");
const fs = require("fs");
const Key = require("../models/Key");
const { sendBypassAttemptWebhook } = require("../cron/discordWebhookSender");

const randomString = require("../utils/generateRandomString");
const monetizeLink = require("../utils/monetizeLink");

const BASE_URL = process.env.BASE_URL;
const DAY_IN_MS = 86400000;
const TURNS = 2;
const MIN_WAIT = 15000; // time to wait on linkvertise in ms

const activeLinks = {};

const logger = require("../utils/logger");

const {
  sendLinkCreatedWebhook,
  sendLinkCompletedWebhook,
} = require("../utils/linkswebhooks");

async function addLink(turns, trackid, checkoutKey) {
  if (!checkoutKey) {
    logger.error("Error: checkoutKey is undefined in addLink");
    return null;
  }

  if (activeLinks[checkoutKey]) {
    activeLinks[checkoutKey].turns = turns;
    activeLinks[checkoutKey].expire = Date.now() + DAY_IN_MS;
  } else {
    activeLinks[checkoutKey] = {
      trackid,
      turns,
      expire: Date.now() + DAY_IN_MS,
      created: Date.now(),
    };
  }

  try {
    const { LINKVERTISE_ID } = process.env;
    await sendLinkCreatedWebhook({ checkoutKey, turns, trackid });
    return monetizeLink(
      LINKVERTISE_ID,
      `${BASE_URL}/link/linkvertise/${checkoutKey}`
    );
  } catch (e) {
    logger.error("Error in addLink:", e);
    return null;
  }
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
  for (const [key, link] of Object.entries(activeLinks)) {
    if (link.expire - Date.now() < 3600000) {
      // Less than 1 hour to expiration
      // sendLinkExpirationNotification(key);
    }
  }
}

function logLinkUsage(checkoutKey) {
  // Implement link usage logging here
  // For example, you could store this data in a database
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

  const averageCompletionTime =
    Object.values(activeLinks)
      .filter((link) => link.completedAt)
      .reduce((sum, link) => sum + (link.completedAt - link.created), 0) /
    totalLinks;

  const completionRate = (completedLinks / totalLinks) * 100;

  return {
    totalActiveLinks: totalLinks,
    linkExpiringWithinHour: expiringSoon,
    oldestLinkAge: Date.now() - oldestLink,
    averageCompletionTime,
    completionRate,
  };
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
      const url = await addLink(TURNS - 1, randomString(12), checkoutKey);
      if (url) {
        res.redirect(url);
      } else {
        console.error("Error: url is undefined after addLink");
        res.redirect(`${BASE_URL}/link/create`);
      }
    } catch (error) {
      console.error("Error in Linkvertise /create-with-type route:", error);
      res
        .status(500)
        .send("An error occurred while creating the Linkvertise link.");
    }
  },

  checkoutKey: async (req, res) => {
    const checkoutKey = req.params.checkoutKey;

    if (!checkoutKey) {
      return res.redirect(`${BASE_URL}/link/create`);
    }

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
    if (turnsLeft > 0) {
      activeLinks[checkoutKey].turns = turnsLeft - 1;
      const url = await addLink(turnsLeft - 1, linkInfo.trackid, checkoutKey);
      if (url) {
        return res.redirect(url);
      } else {
        console.error("Error: url is undefined after addLink");
        return res.redirect(`${BASE_URL}/link/create`);
      }
    } else {
      try {
        const newKey = await createAndSaveNewKey();
        await sendWebhookAndRenderResult(req, res, newKey, linkInfo);
        delete activeLinks[checkoutKey];
      } catch (error) {
        console.error("Error in final key generation:", error);
        res.status(500).send("An error occurred while generating your key.");
      }
    }
  },

  getActiveLinksCount: (req, res) => {
    const count = Object.keys(activeLinks).length;
    res.json({ count });
  },

  deleteAllLinks: (req, res) => {
    const count = Object.keys(activeLinks).length;
    activeLinks = {};
    res.json({ message: `Deleted ${count} active links` });
  },

  getAnalytics: (req, res) => {
    const analytics = generateAnalytics();
    res.json(analytics);
  },
};

async function createAndSaveNewKey() {
  const newKey = new Key({
    id: randomUUID(),
    type: "free",
    value: randomString(12),
  });
  await newKey.save();
  return newKey;
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

// Run cleanup every hour
setInterval(cleanupActiveLinks, 3600000);
