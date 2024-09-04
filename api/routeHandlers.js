const express = require("express");
const rateLimit = require("express-rate-limit");

const asyncHandler = require("express-async-handler");
const { sendSpamWebhook } = require("../cron/discordWebhookSender.js");
const linkvertiseHandler = require("./linkvertise.js");
const lootlabsHandler = require("./lootlabs.js");
const chainedLinksHandler = require("./chainedLinks.js");
const path = require("path");
const fs = require("fs").promises;
const Key = require("../models/Key"); // Make sure to import the Key model

const router = express.Router();

const getIpAddress = (req) => {
  return (
    req.headers["x-forwarded-for"] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    (req.connection.socket ? req.connection.socket.remoteAddress : null)
  );
};

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  handler: async (req, res, options) => {
    const details = {
      ip: getIpAddress(req),
      userAgent: req.headers["user-agent"],
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString(),
    };
    await sendSpamWebhook(details);
    res.status(options.statusCode).send(options.message);
  },
});

router.use(limiter);
router.use(express.urlencoded({ extended: true }));
router.use(express.json());

router.get(
  "/link/create",
  asyncHandler(async (req, res) => {
    const htmlFilePath = path.join(__dirname, "html", "GenerateLinks.html");
    let htmlContent = await fs.readFile(htmlFilePath, "utf8");
    res.send(htmlContent);
  })
);

const createLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 link creations per window
  message: "Too many links created from this IP, please try again later.",
});

router.post(
  "/link/create-with-type",
  createLinkLimiter,
  asyncHandler(async (req, res) => {
    const type = req.body.type;
    const handlers = {
      linkvertise: linkvertiseHandler,
      lootlabs: lootlabsHandler,
      chained: chainedLinksHandler,
    };

    const handler = handlers[type];
    if (handler) {
      await handler.createWithType(req, res);
    } else {
      res.redirect(`${process.env.BASE_URL}/link/create`);
    }
  })
);

router.get(
  "/link/:type/:checkoutKey",
  asyncHandler(async (req, res) => {
    const { type, checkoutKey } = req.params;
    const handlers = {
      linkvertise: linkvertiseHandler,
      lootlabs: lootlabsHandler,
      chained: chainedLinksHandler,
    };

    const handler = handlers[type];
    if (handler) {
      await handler.checkoutKey(req, res);
    } else {
      res.redirect(`${process.env.BASE_URL}/link/create`);
    }
  })
);

router.get(
  "/link/chained/active-count",
  asyncHandler(chainedLinksHandler.getActiveLinksCount)
);

router.post(
  "/link/chained/delete-all",
  asyncHandler(chainedLinksHandler.deleteAllLinks)
);

router.get(
  "/link/chained/analytics",
  asyncHandler(chainedLinksHandler.getAnalytics)
);

router.get(
  "/key/validate/:key",
  asyncHandler(async (req, res) => {
    const { key } = req.params;
    const keyExists = await Key.findOne({ value: key });

    if (keyExists) {
      res.json({ valid: true, message: "Key is valid." });
    } else {
      res
        .status(404)
        .json({ valid: false, message: "Key is not valid or has expired." });
    }
  })
);

module.exports = router;
