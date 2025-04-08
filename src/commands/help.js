const { sendMessage } = require('../utils/message');
const fs = require('fs').promises;
const path = require('path');

async function helpCommand(sock, sender) {
    const welcomeText = '👋 *Welcome to Bingwa Sokoni Bot!*\n\nPlease select an option:\n*1* - Data Offers\n*2* - SMS Offers\n*3* - Talktime Offers\n\nReply with a number (e.g., "1") to view offers.';
    const imagePath = path.join(__dirname, '../assets/welcome.png'); // Local image
    try {
        const imageBuffer = await fs.readFile(imagePath);
        await sendMessage(sock, sender, {
            text: welcomeText,
            image: imageBuffer
        });
    } catch (error) {
        console.error('Failed to load welcome image:', error);
        await sendMessage(sock, sender, welcomeText); // Fallback to text-only
    }
}

module.exports = helpCommand;