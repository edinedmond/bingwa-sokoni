const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const { bundlesCommand, logPurchase } = require('./commands/bundles');
const helpCommand = require('./commands/help');

const userStates = {};

async function startBot() {
    console.log('Bot started successfully!');
    try {
        const { state, saveCreds } = await useMultiFileAuthState('../auth');
        console.log('Auth state initialized');
        const sock = makeWASocket({
            auth: state,
            logger: P({ level: 'debug' }),
            printQRInTerminal: true
        });
        console.log('Socket created, waiting for QR or connection...');

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
                console.log('Disconnect details:', lastDisconnect?.error);
                if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut || lastDisconnect?.error?.output?.statusCode === 401) {
                    console.log('Logged out. Forcing new QR code...');
                    require('fs').rmSync('../auth', { recursive: true, force: true });
                    console.log('Auth cleared. Restart manually or wait for QR.');
                } else {
                    console.log('Reconnecting in 2 seconds...');
                    setTimeout(startBot, 2000);
                }
            }
        });

        setTimeout(() => {
            if (!sock.authState.creds?.me) {
                console.log('No connection established. Forcing QR code...');
                sock.ev.emit('connection.update', { qr: 'QR generation forced due to timeout' });
            }
        }, 10000);

        sock.ev.on('messages.upsert', async (msg) => {
            const message = msg.messages[0];
            if (!message.key.fromMe && message.message?.conversation) {
                const text = message.message.conversation.toLowerCase().trim();
                const sender = message.key.remoteJid;
        
                if (text === 'hello') {
                    delete userStates[sender];
                    await helpCommand(sock, sender);
                } else if (/^[1-3]$/.test(text) || (userStates[sender] && /^\d+$/.test(text)) || text.startsWith('buy')) {
                    await bundlesCommand(sock, sender, text, userStates);
                } else if (userStates[sender]?.step === 'awaiting_recipient_number' || userStates[sender]?.step === 'awaiting_payment_number') {
                    await bundlesCommand(sock, sender, text, userStates);
                } else if (text.startsWith('confirm') && sender === '254779050067@s.whatsapp.net') {
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
    } catch (err) {
        console.error('Startup error:', err);
    }
}

module.exports = startBot;