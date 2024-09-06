const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const linkvertiseHandler = require("../linkvertise");
const lootlabsHandler = require("../lootlabs");
const chainedLinksHandler = require("../chainedLinks");

const handlers = {
  linkvertise: linkvertiseHandler,
  lootlabs: lootlabsHandler,
  chained: chainedLinksHandler,
};

router.get(
  "/:type/create",
  asyncHandler(async (req, res) => {
    const { type } = req.params;
    const handler = handlers[type];
    if (handler && handler.create) {
      await handler.create(req, res);
    } else {
      res.status(404).send("Invalid link type or method not supported");
    }
  })
);

router.post(
  "/:type/create-with-type",
  asyncHandler(async (req, res) => {
    const { type } = req.params;
    const handler = handlers[type];
    if (handler && handler.createWithType) {
      await handler.createWithType(req, res);
    } else {
      res.status(404).send("Invalid link type or method not supported");
    }
  })
);

router.get(
  "/:type/:checkoutKey",
  asyncHandler(async (req, res) => {
    const { type, checkoutKey } = req.params;
    const handler = handlers[type];
    if (handler && handler.checkoutKey) {
      await handler.checkoutKey(req, res);
    } else {
      res.status(404).send("Invalid link type or method not supported");
    }
  })
);

router.get(
  "/:type/active-count",
  asyncHandler(async (req, res) => {
    const { type } = req.params;
    const handler = handlers[type];
    if (handler && handler.getActiveLinksCount) {
      await handler.getActiveLinksCount(req, res);
    } else {
      res.status(404).send("Invalid link type or method not supported");
    }
  })
);

router.post(
  "/:type/delete-all",
  asyncHandler(async (req, res) => {
    const { type } = req.params;
    const handler = handlers[type];
    if (handler && handler.deleteAllLinks) {
      await handler.deleteAllLinks(req, res);
    } else {
      res.status(404).send("Invalid link type or method not supported");
    }
  })
);

router.get(
  "/:type/analytics",
  asyncHandler(async (req, res) => {
    const { type } = req.params;
    const handler = handlers[type];
    if (handler && handler.getAnalytics) {
      await handler.getAnalytics(req, res);
    } else {
      res.status(404).send("Invalid link type or method not supported");
    }
  })
);

module.exports = router;
