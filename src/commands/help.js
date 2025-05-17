const { sendMessage } = require('../utils/message');
const { getUserPoints } = require('../utils/firebase');
const fs = require('fs').promises;
const path = require('path');

async function helpCommand(sock, sender) {
    const userPoints = await getUserPoints(sender);
    const welcomeText = `👋 *Welcome to Bingwa Sokoni Bot!*\n\nPlease select an option:\n*1* - Data Offers\n*2* - SMS Offers\n*3* - Talktime Offers\n\nReply with a number (e.g., "1") to view offers.\n\n🌟 *My Points: ${userPoints}*`;
    const imagePath = path.join(__dirname, '../assets/welcome.png');

    try {
        const imageBuffer = await fs.readFile(imagePath);
        await sendMessage(sock, sender, {
            text: welcomeText,
            image: imageBuffer
        });
    } catch (error) {
        console.error('Failed to load welcome image:', error);
        await sendMessage(sock, sender, welcomeText);
    }
}

module.exports = helpCommand;