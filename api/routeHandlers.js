const express = require("express");
const rateLimit = require("express-rate-limit");
const asyncHandler = require("express-async-handler");
const { sendSpamWebhook } = require("../cron/discordWebhookSender.js");
const path = require("path");
const fs = require("fs").promises;
const Key = require("../models/Key");
const router = express.Router();
const adminRoutes = require("./adminRoutes");
const logger = require("../utils/logger");
const linkRoutes = require("./routes/linkRoutes");

const getIpAddress = (req) => {
  return (
    req.headers["x-forwarded-for"] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    (req.connection.socket ? req.connection.socket.remoteAddress : null)
  );
};

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
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

// Use admin routes before applying the rate limiter
router.use("/admin", adminRoutes);

// Apply rate limiter to all routes except admin routes
router.use((req, res, next) => {
  if (req.path.startsWith("/admin")) {
    return next();
  }
  limiter(req, res, next);
});

router.use(express.urlencoded({ extended: true }));
router.use(express.json());

// Use link routes
router.use("/link", linkRoutes);

router.get(
  "/link/create",
  asyncHandler(async (req, res) => {
    const htmlFilePath = path.join(
      __dirname,
      "..",
      "public",
      "html",
      "GenerateLinks.html"
    );
    let htmlContent = await fs.readFile(htmlFilePath, "utf8");
    res.send(htmlContent);
  })
);

const createLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many links created from this IP, please try again later.",
});

router.post(
  "/link/create-with-type",
  createLinkLimiter,
  asyncHandler(async (req, res) => {
    const { type } = req.body;
    res.redirect(307, `/link/${type}/create-with-type`);
  })
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
