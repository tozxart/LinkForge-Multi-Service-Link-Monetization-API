const express = require("express");
const path = require("path");
const app = express();

// ... (other middleware and configurations)

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// ... (routes and other configurations)
