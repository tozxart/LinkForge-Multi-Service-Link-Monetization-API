const express = require("express");
const cors = require("cors");
const path = require("path");
const app = express();

module.exports = () => {
  app.use((req, res, next) => {
    console.log(req.originalUrl);
    next();
  });

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "public")));

  const routeHandlers = require("./routeHandlers");

  app.use("/", routeHandlers);

  const PORT = process.env.API_PORT;
  app.listen(PORT, () => {
    console.log(`👂 Listening on port: ${PORT}`);
  });
};
