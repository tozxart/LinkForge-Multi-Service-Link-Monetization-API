const express = require("express");
const router = express.Router();
const asyncHandler = require("express-async-handler");
const path = require("path");
const jwt = require("jsonwebtoken");
const Key = require("../models/Key");
const crypto = require("crypto");
const generateRandomString = require("../utils/generateRandomString");
const calculateExpirationDate = require("../utils/calculateExpirationDate");
const axios = require("axios");

// Discord OAuth2 configuration
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = `${process.env.BASE_URL}/admin/auth/discord/callback`;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const ALLOWED_DISCORD_USER_IDS =
  process.env.ALLOWED_DISCORD_USER_IDS.split(",");

// Admin authentication middleware
const authenticateAdmin = (req, res, next) => {
  const token = req.header("x-auth-token");
  if (!token)
    return res
      .status(401)
      .json({ message: "Access denied. No token provided." });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (ex) {
    res.status(400).json({ message: "Invalid token." });
  }
};

function generateUniqueKeyValue() {
  return crypto.randomBytes(8).toString("hex");
}

// Admin login route (GET)
router.get(
  "/login",
  asyncHandler(async (req, res) => {
    res.sendFile(path.join(__dirname, "html", "AdminLogin.html"));
  })
);

// Discord OAuth2 login route
router.get("/auth/discord", (req, res) => {
  const authorizeUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(
    DISCORD_REDIRECT_URI
  )}&response_type=code&scope=identify`;
  res.redirect(authorizeUrl);
});

// Discord OAuth2 callback route
router.get(
  "/auth/discord/callback",
  asyncHandler(async (req, res) => {
    const { code } = req.query;

    try {
      // Exchange code for access token
      const tokenResponse = await axios.post(
        "https://discord.com/api/oauth2/token",
        new URLSearchParams({
          client_id: DISCORD_CLIENT_ID,
          client_secret: DISCORD_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
          redirect_uri: DISCORD_REDIRECT_URI,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const { access_token } = tokenResponse.data;

      // Get user information
      const userResponse = await axios.get(
        "https://discord.com/api/users/@me",
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        }
      );

      const { id: discordUserId } = userResponse.data;

      // Check if the user is allowed to access the admin panel
      if (!ALLOWED_DISCORD_USER_IDS.includes(discordUserId)) {
        return res
          .status(403)
          .json({
            message:
              "Access denied. You are not authorized to access the admin panel.",
          });
      }

      // Generate JWT token
      const token = jwt.sign({ discordUserId }, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });

      // Set token in localStorage and redirect to dashboard
      res.send(`
        <script>
          localStorage.setItem("adminToken", "${token}");
          window.location.href = "/admin/dashboard";
        </script>
      `);
    } catch (error) {
      console.error("Discord authentication error:", error);
      res
        .status(500)
        .json({ message: "An error occurred during authentication" });
    }
  })
);

// Admin dashboard route
router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    res.sendFile(path.join(__dirname, "html", "AdminDashboard.html"));
  })
);

// Get all keys
router.get(
  "/keys",
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const keys = await Key.find({}).select(
      "id value type duration createdAt expiresAt"
    );
    res.json(keys);
  })
);

// Create a new key
router.post(
  "/keys",
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const { type, duration } = req.body;
    const durationMs = parseInt(duration) * 60 * 60 * 1000;
    if (isNaN(durationMs)) {
      return res.status(400).json({ message: "Invalid duration provided" });
    }

    const newKey = new Key({
      id: generateRandomString(16),
      value: generateUniqueKeyValue(),
      type,
      duration: durationMs,
    });
    await newKey.save();

    const expiresAt = calculateExpirationDate(
      newKey.createdAt,
      newKey.duration,
      newKey.type
    );

    res.status(201).json({
      message: "Key created successfully",
      key: { ...newKey.toObject(), expiresAt },
    });
  })
);

// Delete a key
router.delete(
  "/keys/:keyValue",
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const keyValue = req.params.keyValue;
    const deletedKey = await Key.findOneAndDelete({ value: keyValue });

    if (!deletedKey) {
      return res.status(404).json({ message: "Key not found" });
    }

    res.json({ message: "Key deleted successfully" });
  })
);

// Add time to a key
router.post(
  "/keys/:keyValue/add-time",
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const keyValue = req.params.keyValue;
    const { additionalTime } = req.body;

    const key = await Key.findOne({ value: keyValue });

    if (!key) {
      return res.status(404).json({ message: "Key not found" });
    }

    const additionalMs = parseInt(additionalTime) * 60 * 60 * 1000;
    if (isNaN(additionalMs)) {
      return res
        .status(400)
        .json({ message: "Invalid additional time provided" });
    }

    // Calculate the new duration
    const now = new Date();
    const currentExpirationDate = calculateExpirationDate(
      key.createdAt,
      key.duration,
      key.type
    );
    const newDuration = Math.max(currentExpirationDate - now, 0) + additionalMs;

    key.duration = newDuration;
    await key.save();

    res.json({
      message: "Time added successfully",
      updatedKey: {
        ...key.toObject(),
        duration: key.duration,
      },
    });
  })
);

module.exports = router;
