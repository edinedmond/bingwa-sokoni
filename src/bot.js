const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const P = require('pino');
const { bundlesCommand, logPurchase } = require('./commands/bundles');
const helpCommand = require('./commands/help');

const userStates = {};

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('../auth');
    const sock = makeWASocket({
        auth: state,
        logger: P({ level: 'silent' }),
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, qr, lastDisconnect } = update;
        if (qr) {
            console.log('QR Code Generated! Scan this with your phone:');
            console.log(qr);
        }
        if (connection === 'open') {
            console.log('Connected to WhatsApp!');
        }
        if (connection === 'close') {
            console.log('Disconnected:', lastDisconnect?.error?.message || 'Unknown reason');
            if (lastDisconnect?.error?.output?.statusCode !== 401) {
                console.log('Reconnecting in 2 seconds...');
                setTimeout(startBot, 2000);
            } else {
                console.log('Logged out. A new QR code will be generated.');
            }
        }
    });

    sock.ev.on('messages.upsert', async (msg) => {
        const message = msg.messages[0];
        if (!message.key.fromMe && message.message?.conversation) {
            const text = message.message.conversation.toLowerCase().trim();
            const sender = message.key.remoteJid;

            if (text === 'hello') {
                delete userStates[sender]; // Reset state for a fresh start
                await helpCommand(sock, sender);
            } else if (/^[1-3]$/.test(text) || /^\d+$/.test(text) || text.startsWith('buy')) {
                await bundlesCommand(sock, sender, text, userStates);
            } else if (userStates[sender]?.step === 'awaiting_number') {
                const phone = text;
                if (/^(07|01)\d{8}$/.test(phone)) {
                    const { category, itemId } = userStates[sender];
                    const item = require('./config/bundles.json')[category].find(i => i.id === itemId);
                    await sock.sendMessage(sender, { text: `✅ *Bingwa Sokoni*: ${item.name} processing for ${phone}. Wait for confirmation.` });
                    await logPurchase(phone, item);
                    delete userStates[sender];
                } else {
                    await sock.sendMessage(sender, { text: '❌ Invalid number. Reply with a valid Kenyan number (e.g., 0712345678).' });
                }
            } else if (userStates[sender]?.step === 'confirming') {
                await bundlesCommand(sock, sender, text, userStates);
            } else if (text.startsWith('confirm') && sender === 'your-number@s.whatsapp.net') { // Replace with your WhatsApp ID
                const phone = text.split(' ')[1];
                if (/^(07|01)\d{8}$/.test(phone)) {
                    await sock.sendMessage(`${phone}@s.whatsapp.net`, { text: '🎉 *Bingwa Sokoni*: Your offer has been activated!' });
                    console.log(`Confirmed activation for ${phone}`);
                } else {
                    await sock.sendMessage(sender, { text: '❌ Invalid number format for confirmation.' });
                }
            } else {
                await sock.sendMessage(sender, { text: '🤔 Unknown command. Reply "hello" for options.' });
            }
        }
    });
}

module.exports = startBot;