// bot.js (ESM compatible)

import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} from "@whiskeysockets/baileys";
import Pino from "pino";
import qrcode from "qrcode-terminal";
import fs from "fs";

import { bundlesCommand, logPurchase } from "./commands/bundles.js";
import helpCommand from "./commands/help.js";

const userStates = {};

async function startBot() {
  console.log("🚀 Bot starting...");
  try {
    const { state, saveCreds } = await useMultiFileAuthState("./auth");
    console.log("✅ Auth state initialized");

    const sock = makeWASocket({
      auth: state,
      logger: Pino({ level: "debug" })
      // removed printQRInTerminal (deprecated)
    });

    console.log("📡 Socket created, waiting for QR or connection...");

    // Save session updates
    sock.ev.on("creds.update", saveCreds);

    // Handle connection + QR
    sock.ev.on("connection.update", (update) => {
      const { connection, qr, lastDisconnect } = update;

      if (qr) {
        console.log("📲 Scan this QR with WhatsApp app (Linked Devices):");
        qrcode.generate(qr, { small: true });
      }

      if (connection === "open") {
        console.log("✅ Connected to WhatsApp!");
      }

      if (connection === "close") {
        console.log(
          "⚠️ Disconnected:",
          lastDisconnect?.error?.message || "Unknown reason"
        );
        console.log("Details:", lastDisconnect?.error);

        const statusCode = lastDisconnect?.error?.output?.statusCode;

        if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
          console.log("❌ Logged out. Clearing auth and forcing new QR...");
          fs.rmSync("./auth", { recursive: true, force: true });
          console.log("🔄 Restart the bot to get a fresh QR.");
        } else {
          console.log("♻️ Reconnecting in 2 seconds...");
          setTimeout(startBot, 2000);
        }
      }
    });

    // Force QR if no connection after 10s
    setTimeout(() => {
      if (!sock.authState.creds?.me) {
        console.log("⏳ No connection established. Forcing QR...");
        sock.ev.emit("connection.update", {
          qr: "QR generation forced due to timeout"
        });
      }
    }, 10000);

    // Handle incoming messages
    sock.ev.on("messages.upsert", async (msg) => {
      const message = msg.messages[0];
      if (!message.key.fromMe && message.message?.conversation) {
        const text = message.message.conversation.toLowerCase().trim();
        const sender = message.key.remoteJid;

        if (text === "hello") {
          delete userStates[sender];
          await helpCommand(sock, sender);
        } else if (
          /^[1-3]$/.test(text) ||
          (userStates[sender] && /^\d+$/.test(text)) ||
          text.startsWith("buy")
        ) {
          await bundlesCommand(sock, sender, text, userStates);
        } else if (
          userStates[sender]?.step === "awaiting_recipient_number" ||
          userStates[sender]?.step === "awaiting_payment_number"
        ) {
          await bundlesCommand(sock, sender, text, userStates);
        } else if (
          text.startsWith("confirm") &&
          sender === "254779050067@s.whatsapp.net"
        ) {
          const phone = text.split(" ")[1];
          if (/^(07|01)\d{8}$/.test(phone)) {
            await sock.sendMessage(`${phone}@s.whatsapp.net`, {
              text: "🎉 *Bingwa Sokoni*: Your offer has been activated!"
            });
            console.log(`✅ Confirmed activation for ${phone}`);
          } else {
            await sock.sendMessage(sender, {
              text: "❌ Invalid number format for confirmation."
            });
          }
        } else {
          await sock.sendMessage(sender, {
            text: '🤔 Unknown command. Reply "hello" for options.'
          });
        }
      }
    });
  } catch (err) {
    console.error("❌ Startup error:", err);
  }
}

export default startBot;
