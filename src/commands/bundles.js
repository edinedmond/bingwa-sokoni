const { sendMessage } = require('../utils/message');
const fs = require('fs').promises;
const offers = require('../config/bundles.json');

async function bundlesCommand(sock, sender, text, userStates) {
    const categories = { '1': 'dataOffers', '2': 'smsOffers', '3': 'talktimeOffers' };
    const category = categories[text];

    if (category && !userStates[sender]?.step) {
        const items = offers[category];
        let reply = category === 'dataOffers' ? '📱 *DISCOUNTED Data Offers* 📱\n\n' :
                    category === 'smsOffers' ? '✉️ *Send Texts Seamlessly* ✉️\n\n' :
                    '📞 *Talktime Minutes* 📞\n\n';
        items.forEach(item => {
            reply += `*${item.id}* - ${item.name} (KSh ${item.price})\n`;
        });
        reply += '\n💡 *Reply with a number* to buy (e.g., "1")\n*0* - Go Back';
        await sendMessage(sock, sender, reply);
        userStates[sender] = { category, step: 'selecting' };
    } else if (userStates[sender]?.step === 'selecting') {
        if (text === '0') {
            await sendMessage(sock, sender, '🔙 Returning to main menu. Reply "hello" to start over.');
            delete userStates[sender];
        } else {
            const items = offers[userStates[sender].category];
            const id = parseInt(text);
            const item = items.find(i => i.id === id);
            if (item) {
                const reply = `🛒 *${item.name} (KSh ${item.price})*\n\nReply:\n*1* - Buy Now\n*2* - Cancel\n*0* - Go Back`;
                await sendMessage(sock, sender, reply);
                userStates[sender] = { category: userStates[sender].category, itemId: id, step: 'confirming' };
            } else {
                await sendMessage(sock, sender, '❌ Invalid choice. Reply with a valid number or *0* to go back.');
            }
        }
    } else if (userStates[sender]?.step === 'confirming') {
        const items = offers[userStates[sender].category];
        const item = items.find(i => i.id === userStates[sender].itemId);
        if (text === '1') {
            const reply = `✅ *Bingwa Sokoni Purchase*\n\nOffer: ${item.name}\nCost: KSh ${item.price}\n\n✅ Pay via M-PESA Till 4185628.\nNote: The phone number that makes payment will receive the purchased offer.`;
            await sendMessage(sock, sender, reply);
            userStates[sender].step = 'awaiting_number';
        } else if (text === '2') {
            await sendMessage(sock, sender, '🔙 Purchase cancelled. Reply "hello" to start over.');
            delete userStates[sender];
        } else if (text === '0') {
            const items = offers[userStates[sender].category];
            let reply = userStates[sender].category === 'dataOffers' ? '📱 *DISCOUNTED Data Offers* 📱\n\n' :
                        userStates[sender].category === 'smsOffers' ? '✉️ *Send Texts Seamlessly* ✉️\n\n' :
                        '📞 *Talktime Minutes* 📞\n\n';
            items.forEach(item => {
                reply += `*${item.id}* - ${item.name} (KSh ${item.price})\n`;
            });
            reply += '\n💡 *Reply with a number* to buy (e.g., "1")\n*0* - Go Back';
            await sendMessage(sock, sender, reply);
            userStates[sender] = { category: userStates[sender].category, step: 'selecting' };
        } else {
            await sendMessage(sock, sender, '❌ Reply *1* to buy, *2* to cancel, or *0* to go back.');
        }
    }
}

async function logPurchase(phone, item) {
    const timestamp = new Date().toISOString();
    const logEntry = { phone, offer: item.name, price: item.price, timestamp, status: 'pending' };
    const logs = await fs.readFile('purchases.json', 'utf8').catch(() => '[]');
    const purchases = JSON.parse(logs);
    purchases.push(logEntry);
    await fs.writeFile('purchases.json', JSON.stringify(purchases, null, 2));
    console.log(`Pending: Send ${item.name} (KSh ${item.price}) to ${phone} via *180#`);
}

module.exports = { bundlesCommand, logPurchase };