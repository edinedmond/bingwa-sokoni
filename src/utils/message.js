const fs = require('fs').promises; // For reading local files

async function sendMessage(sock, recipient, content) {
    if (typeof content === 'string') {
        // Text-only message
        await sock.sendMessage(recipient, { text: content });
    } else if (content.text && content.image) {
        // Image + text message
        await sock.sendMessage(recipient, {
            image: content.image, // Can be URL or buffer
            caption: content.text
        });
    } else {
        throw new Error('Invalid content format for sendMessage');
    }
}

module.exports = { sendMessage };