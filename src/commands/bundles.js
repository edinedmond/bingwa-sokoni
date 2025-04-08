const { sendMessage } = require('../utils/message');
const fs = require('fs').promises;
const axios = require('axios');
const offers = require('../config/bundles.json');
require('dotenv').config();

const apiUsername = process.env.PAYHERO_API_USERNAME || 'zQA8OJbEwvr68AKJnhSA';
const apiPassword = process.env.PAYHERO_API_PASSWORD || 'MQ7GAlKvhPKpB27fiKp35ZRvJWj92637ThSg1C0P';
const channelId = process.env.PAYHERO_CHANNEL_ID || '1874';
const adminNumber = `${process.env.ADMIN_NUMBER}@s.whatsapp.net` || '254779050067@s.whatsapp.net';

const credentials = `${apiUsername}:${apiPassword}`;
const encodedCredentials = Buffer.from(credentials).toString('base64');
const basicAuthToken = `Basic ${encodedCredentials}`;

async function bundlesCommand(sock, sender, text, userStates) {
    const categories = {
        '1': { type: 'dataOffers' },
        '2': { type: 'smsOffers' },
        '3': { type: 'talktimeOffers' }
    };
    const dataSubtypes = {
        '1': 'daily',
        '2': 'weekly',
        '3': 'monthly'
    };

    // Initial category selection
    if (categories[text] && !userStates[sender]?.step) {
        if (categories[text].type === 'dataOffers') {
            const reply = '📱 *Data Offers* 📱\n\nPlease select a type:\n*1* - Daily\n*2* - Weekly\n*3* - Monthly\n\nReply with a number (e.g., "1")';
            await sendMessage(sock, sender, reply);
            userStates[sender] = { type: 'dataOffers', step: 'selecting_subtype' };
        } else {
            const items = offers[categories[text].type];
            let reply = categories[text].type === 'smsOffers' ? '✉️ *Send Texts Seamlessly* ✉️\n\n' :
                        '📞 *Talktime Minutes* 📞\n\n';
            items.forEach(item => {
                reply += `*${item.id}* - ${item.name} (KSh ${item.price})\n`;
            });
            reply += '\n💡 *Reply with a number* to buy (e.g., "1")\n*0* - Go Back';
            await sendMessage(sock, sender, reply);
            userStates[sender] = { type: categories[text].type, step: 'selecting' };
        }
    }
    // Invalid initial input
    else if (!categories[text] && !userStates[sender]?.step) {
        await sendMessage(sock, sender, '❌ Invalid option. Reply "hello" to see the menu.');
    }
    // Subtype selection for data offers
    else if (userStates[sender]?.step === 'selecting_subtype' && userStates[sender].type === 'dataOffers') {
        const subtype = dataSubtypes[text];
        if (subtype) {
            const items = offers.dataOffers[subtype];
            if (!items || !Array.isArray(items)) {
                console.error(`Invalid items for dataOffers.${subtype}`);
                await sendMessage(sock, sender, '❌ Error loading offers. Reply "hello" to try again.');
                delete userStates[sender];
                return;
            }
            let reply = subtype === 'daily' ? '📱 *Daily Data Offers* 📱\n\n' :
                        subtype === 'weekly' ? '📱 *Weekly Data Offers* 📱\n\n' :
                        '📱 *Monthly Data Offers* 📱\n\n';
            items.forEach(item => {
                reply += `*${item.id}* - ${item.name} (KSh ${item.price})\n`;
            });
            reply += '\n💡 *Reply with a number* to buy (e.g., "1")\n*0* - Go Back';
            await sendMessage(sock, sender, reply);
            userStates[sender] = { type: 'dataOffers', subtype, step: 'selecting' };
        } else {
            await sendMessage(sock, sender, '❌ Invalid type. Reply with 1 (Daily), 2 (Weekly), or 3 (Monthly).');
        }
    }
    // Item selection
    else if (userStates[sender]?.step === 'selecting') {
        if (text === '0') {
            if (userStates[sender].type === 'dataOffers') {
                const reply = '📱 *Data Offers* 📱\n\nPlease select a type:\n*1* - Daily\n*2* - Weekly\n*3* - Monthly\n\nReply with a number (e.g., "1")';
                await sendMessage(sock, sender, reply);
                userStates[sender] = { type: 'dataOffers', step: 'selecting_subtype' };
            } else {
                await sendMessage(sock, sender, '🔙 Returning to main menu. Reply "hello" to start over.');
                delete userStates[sender];
            }
        } else {
            const items = userStates[sender].subtype ? offers[userStates[sender].type][userStates[sender].subtype] : offers[userStates[sender].type];
            if (!items || !Array.isArray(items)) {
                console.error(`Invalid items for ${userStates[sender].type}${userStates[sender].subtype ? '.' + userStates[sender].subtype : ''}`);
                await sendMessage(sock, sender, '❌ Error loading offers. Reply "hello" to try again.');
                delete userStates[sender];
                return;
            }
            const id = parseInt(text);
            const item = items.find(i => i.id === id);
            if (item) {
                const reply = `🛒 *${item.name} (KSh ${item.price})*\n\nPlease enter the recipient\'s phone number (e.g., 0712345678):`;
                await sendMessage(sock, sender, reply);
                userStates[sender] = { type: userStates[sender].type, subtype: userStates[sender].subtype, itemId: id, step: 'awaiting_recipient_number' };
            } else {
                await sendMessage(sock, sender, '❌ Invalid choice. Reply with a valid number or *0* to go back.');
            }
        }
    }
    // Awaiting recipient number
    else if (userStates[sender]?.step === 'awaiting_recipient_number') {
        const recipientPhone = text;
        if (/^(07|01)\d{8}$/.test(recipientPhone)) {
            const reply = `✅ Recipient: ${recipientPhone}\n\nPlease enter the payment phone number (e.g., 0712345678):`;
            await sendMessage(sock, sender, reply);
            userStates[sender] = { 
                type: userStates[sender].type, 
                subtype: userStates[sender].subtype, 
                itemId: userStates[sender].itemId, 
                recipientPhone, 
                step: 'awaiting_payment_number' 
            };
        } else {
            await sendMessage(sock, sender, '❌ Invalid number. Please reply with a valid Kenyan number (e.g., 0712345678).');
        }
    }
    // Awaiting payment number and initiating STK Push
    else if (userStates[sender]?.step === 'awaiting_payment_number') {
        const paymentPhone = text;
        if (/^(07|01)\d{8}$/.test(paymentPhone)) {
            const items = userStates[sender].subtype ? offers[userStates[sender].type][userStates[sender].subtype] : offers[userStates[sender].type];
            const item = items.find(i => i.id === userStates[sender].itemId);

            // Normalize phone number to 254 format
            const normalizedPhone = paymentPhone.startsWith('0') ? '254' + paymentPhone.slice(1) : paymentPhone;
            const externalReference = `BINGWA-${sender.split('@')[0]}-${Date.now()}`;

            try {
                const response = await axios.post(
                    'https://backend.payhero.co.ke/api/v2/payments',
                    {
                        amount: item.price,
                        phone_number: normalizedPhone,
                        channel_id: channelId,
                        provider: "m-pesa",
                        external_reference: externalReference,
                        customer_name: "Bingwa Customer",
                        callback_url: "https://your-callback-url.com/payhero-callback" // Replace with your callback URL
                    },
                    {
                        headers: {
                            'Authorization': basicAuthToken,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                if (response.data.status === "QUEUED" || response.data.success) {
                    await sendMessage(sock, sender, `✅ STK Push initiated! Check ${paymentPhone} and enter your M-Pesa PIN to pay KSh ${item.price}.`);
                    const reference = response.data.reference;
                    if (reference) {
                        await pollTransactionStatus(sock, sender, reference, userStates[sender], item);
                    } else {
                        console.error(`No reference in STK response: ${JSON.stringify(response.data)}`);
                        await sendMessage(sock, sender, '⚠️ Payment initiated, but status check failed. Please wait or contact support.');
                    }
                } else {
                    await sendMessage(sock, sender, '⚠️ Failed to initiate STK Push. Try again or contact support.');
                    console.error(`STK Push failed: ${JSON.stringify(response.data)}`);
                }
            } catch (err) {
                console.error(`STK Push error: ${err.message}, Data: ${JSON.stringify(err.response?.data)}`);
                if (err.response?.data?.error_message === "insufficient balance") {
                    await sendMessage(sock, sender, '⚠️ Payment failed due to insufficient system balance. Try again later or contact support.');
                } else {
                    await sendMessage(sock, sender, '⚠️ Error initiating payment. Contact support.');
                }
            }
            delete userStates[sender];
        } else {
            await sendMessage(sock, sender, '❌ Invalid number. Please reply with a valid Kenyan number (e.g., 0712345678).');
        }
    }
}

async function pollTransactionStatus(sock, sender, reference, userState, item) {
    const maxAttempts = 24; // 2 minutes
    let attempts = 0;

    const checkStatus = async () => {
        try {
            const response = await axios.get(
                `https://backend.payhero.co.ke/api/v2/transaction-status?reference=${reference}`,
                {
                    headers: {
                        'Authorization': basicAuthToken,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const statusData = response.data;
            console.log(`Transaction status: ${JSON.stringify(statusData)}`);

            if (statusData.status === 'success' || statusData.status === 'COMPLETED' || statusData.status === 'SUCCESS') {
                const transactionId = statusData.transaction_id || statusData.checkout_request_id || reference;
                await sendMessage(sock, sender, `🎉 Payment of KSh ${item.price} confirmed! Transaction ID: ${transactionId}. Your ${item.name} will be processed shortly.`);

                // Send to admin
                const adminMessage = `🔔 *New Purchase Confirmed*\n\nOffer: ${item.name}\nCost: KSh ${item.price}\nRecipient: ${userState.recipientPhone}\nPayment Number: ${userState.recipientPhone.startsWith('0') ? '254' + userState.recipientPhone.slice(1) : userState.recipientPhone}\n\n`;
                await sock.sendMessage(adminNumber, { text: adminMessage });
                console.log(`Sent purchase details to ${adminNumber}`);

                await logPurchase(userState.recipientPhone, item);
                return true;
            } else if (statusData.status === 'FAILED' || statusData.status === 'CANCELLED') {
                await sendMessage(sock, sender, `⚠️ Payment failed. Transaction ID: ${reference}. Please retry or contact support.`);
                return true;
            }
            return false;
        } catch (err) {
            console.error(`Polling error: ${err.message}`);
            return false;
        }
    };

    return new Promise((resolve) => {
        const interval = setInterval(async () => {
            attempts++;
            const done = await checkStatus();
            if (done || attempts >= maxAttempts) {
                clearInterval(interval);
                if (attempts >= maxAttempts) {
                    await sendMessage(sock, sender, '⏳ Payment status pending. Please check back later or contact support.');
                    console.log(`Polling timeout for reference ${reference}`);
                }
                resolve();
            }
        }, 5000);
    });
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