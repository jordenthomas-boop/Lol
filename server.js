const express = require("express");
const { createBareServer } = require("@tomphttp/bare-server-node");
const path = require("path");

const app = express();
const bare = createBareServer("/bare/");

app.use(express.static("./public"));

app.use("/uv/", require("@titaniumnetwork-dev/ultraviolet"));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

const server = app.listen(process.env.PORT || 3000);

server.on("request", (req, res) => {
  if (bare.shouldRoute(req)) {
    bare.routeRequest(req, res);
  }
});
