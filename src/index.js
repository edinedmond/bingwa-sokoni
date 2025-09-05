// index.js (ESM compatible)

import dotenv from "dotenv";
import express from "express";
import startBot from "./bot.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).send("Bingwa Sokoni Bot is running");
});

app.post("/payhero-callback", (req, res) => {
  console.log("PayHero callback received:", req.body);
  res.status(200).send("Callback received");
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on port ${port}`);
});

async function main() {
  try {
    await startBot();
    console.log("Bot started successfully!");
  } catch (error) {
    console.error("Failed to start bot:", error);
    process.exit(1);
  }
}

main();
