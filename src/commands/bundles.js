const { sendMessage } = require('../utils/message');
const fs = require('fs').promises;
const axios = require('axios');
const path = require('path'); // Added to fix ReferenceError
const offers = require('../config/bundles.json');
const { updateUserPoints, getUserPoints, canMakePurchase, recordPurchase } = require('../utils/firebase');
require('dotenv').config();

// API credentials
const apiUsername = process.env.PAYHERO_API_USERNAME || 'zQA8OJbEwvr68AKJnhSA';
const apiPassword = process.env.PAYHERO_API_PASSWORD || 'MQ7GAlKvhPKpB27fiKp35ZRvJWj92637ThSg1C0P';
const channelId = process.env.PAYHERO_CHANNEL_ID || '2008';
const adminNumber = process.env.ADMIN_NUMBER ? `${process.env.ADMIN_NUMBER}@s.whatsapp.net` : '254110562739@s.whatsapp.net';

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
                // Fetch user points
                const userPoints = await getUserPoints(sender);
                if (userPoints >= 20) {
                    // Offer points spending option
                    const maxPointsUsable = Math.min(userPoints, item.price); // Can't use more points than item price
                    const reply = `🛒 *${item.name} (KSh ${item.price})*\n\n🌟 You have ${userPoints} points!\nYou can use points to reduce the price (1 point = KSh 1).\nMax usable: ${maxPointsUsable} points.\n\nReply:\n*1* - Use ${maxPointsUsable} points (Pay KSh ${item.price - maxPointsUsable})\n*2* - Pay full price (KSh ${item.price})\n*0* - Go back`;
                    await sendMessage(sock, sender, reply);
                    userStates[sender] = { 
                        type: userStates[sender].type, 
                        subtype: userStates[sender].subtype, 
                        itemId: id, 
                        step: 'selecting_points_usage', 
                        pointsUsable: maxPointsUsable 
                    };
                } else {
                    // Not enough points, proceed to phone number
                    const reply = `🛒 *${item.name} (KSh ${item.price})*\n\n🌟 You have ${userPoints} points (need 20+ to use).\nPlease enter the phone number (e.g., 0712345678):\nThis is the number that you will receive your order`;
                    await sendMessage(sock, sender, reply);
                    userStates[sender] = { 
                        type: userStates[sender].type, 
                        subtype: userStates[sender].subtype, 
                        itemId: id, 
                        step: 'awaiting_payment_number', 
                        pointsUsed: 0 
                    };
                }
            } else {
                await sendMessage(sock, sender, '❌ Invalid choice. Reply with a valid number or *0* to go back.');
            }
        }
    }
    // Points usage selection
    else if (userStates[sender]?.step === 'selecting_points_usage') {
        if (text === '0') {
            // Go back to item selection
            const items = userStates[sender].subtype ? offers[userStates[sender].type][userStates[sender].subtype] : offers[userStates[sender].type];
            let reply = userStates[sender].type === 'dataOffers' ? 
                        `📱 *${userStates[sender].subtype.charAt(0).toUpperCase() + userStates[sender].subtype.slice(1)} Data Offers* 📱\n\n` :
                        userStates[sender].type === 'smsOffers' ? '✉️ *Send Texts Seamlessly* ✉️\n\n' :
                        '📞 *Talktime Minutes* 📞\n\n';
            items.forEach(item => {
                reply += `*${item.id}* - ${item.name} (KSh ${item.price})\n`;
            });
            reply += '\n💡 *Reply with a number* to buy (e.g., "1")\n*0* - Go Back';
            await sendMessage(sock, sender, reply);
            userStates[sender] = { type: userStates[sender].type, subtype: userStates[sender].subtype, step: 'selecting' };
        } else if (text === '1') {
            // Use points
            const reply = `🛒 Using ${userStates[sender].pointsUsable} points to reduce price to KSh ${offers[userStates[sender].type][userStates[sender].subtype]?.find(i => i.id === userStates[sender].itemId)?.price - userStates[sender].pointsUsable || offers[userStates[sender].type].find(i => i.id === userStates[sender].itemId).price - userStates[sender].pointsUsable}.\nPlease enter the phone number (e.g., 0712345678):\nThis is the number that you will receive your order`;
            await sendMessage(sock, sender, reply);
            userStates[sender] = { 
                type: userStates[sender].type, 
                subtype: userStates[sender].subtype, 
                itemId: userStates[sender].itemId, 
                step: 'awaiting_payment_number', 
                pointsUsed: userStates[sender].pointsUsable 
            };
        } else if (text === '2') {
            // Pay full price
            const reply = `🛒 Paying full price for ${offers[userStates[sender].type][userStates[sender].subtype]?.find(i => i.id === userStates[sender].itemId)?.name || offers[userStates[sender].type].find(i => i.id === userStates[sender].itemId).name} (KSh ${offers[userStates[sender].type][userStates[sender].subtype]?.find(i => i.id === userStates[sender].itemId)?.price || offers[userStates[sender].type].find(i => i.id === userStates[sender].itemId).price}).\nPlease enter the phone number (e.g., 0712345678):\nThis is the number that you will receive your order`;
            await sendMessage(sock, sender, reply);
            userStates[sender] = { 
                type: userStates[sender].type, 
                subtype: userStates[sender].subtype, 
                itemId: userStates[sender].itemId, 
                step: 'awaiting_payment_number', 
                pointsUsed: 0 
            };
        } else {
            await sendMessage(sock, sender, '❌ Invalid choice. Reply with 1 (Use points), 2 (Pay full price), or 0 (Go back).');
        }
    }
    // Awaiting payment number and initiating STK Push
    else if (userStates[sender]?.step === 'awaiting_payment_number') {
        const paymentPhone = text;
        if (/^(07|01)\d{8}$/.test(paymentPhone)) {
            const items = userStates[sender].subtype ? offers[userStates[sender].type][userStates[sender].subtype] : offers[userStates[sender].type];
            const item = items.find(i => i.id === userStates[sender].itemId);

            // Calculate final payment amount after points
            const pointsUsed = userStates[sender].pointsUsed || 0;
            const finalPrice = item.price - pointsUsed;

            // Normalize phone number to 254 format
            const normalizedPhone = paymentPhone.startsWith('0') ? '254' + paymentPhone.slice(1) : paymentPhone;

            // Check daily purchase limit
            const canPurchase = await canMakePurchase(normalizedPhone);
            if (!canPurchase) {
                await sendMessage(sock, sender, `❌ Sorry, this phone number (${paymentPhone}) has already made a purchase today. Try again tomorrow.`);
                delete userStates[sender];
                return;
            }

            const externalReference = `BINGWA-${sender.split('@')[0]}-${Date.now()}`;

            try {
                // Deduct points if used
                if (pointsUsed > 0) {
                    console.log(`Deducting ${pointsUsed} points for ${sender}`);
                    await updateUserPoints(sender, -pointsUsed); // Subtract points
                }

                const response = await axios.post(
                    'https://backend.payhero.co.ke/api/v2/payments',
                    {
                        amount: finalPrice,
                        phone_number: normalizedPhone,
                        channel_id: channelId,
                        provider: "m-pesa",
                        external_reference: externalReference,
                        customer_name: "Bingwa Customer",
                        callback_url: "https://your-callback-url.com/payhero-callback"
                    },
                    {
                        headers: {
                            'Authorization': basicAuthToken,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                if (response.data.status === "QUEUED" || response.data.success) {
                    await sendMessage(sock, sender, `✅ STK Push initiated! Check ${paymentPhone} and enter your M-Pesa PIN to pay KSh ${finalPrice}.`);
                    const reference = response.data.reference;
                    if (reference) {
                        userStates[sender].isPolling = true;
                        userStates[sender].paymentPhone = normalizedPhone; // Store normalized phone
                        await pollTransactionStatus(sock, sender, reference, userStates[sender], item);
                    } else {
                        console.error(`No reference in STK response: ${JSON.stringify(response.data)}`);
                        await sendMessage(sock, sender, '⚠️ Payment initiated, but status check failed. Please wait or contact support.');
                    }
                } else {
                    await sendMessage(sock, sender, '⚠️ Failed to initiate STK Push. Try again or contact support.');
                    console.error(`STK Push failed: ${JSON.stringify(response.data)}`);
                    // Revert points if payment initiation fails
                    if (pointsUsed > 0) {
                        console.log(`Refunding ${pointsUsed} points for ${sender} due to STK failure`);
                        await updateUserPoints(sender, pointsUsed);
                        await sendMessage(sock, sender, `🌟 ${pointsUsed} points have been refunded due to payment failure.`);
                    }
                }
            } catch (err) {
                console.error(`STK Push error: ${err.message}, Data: ${JSON.stringify(err.response?.data)}`);
                let errorMessage = '⚠️ Error initiating payment. Contact support.';
                if (err.response?.data?.error_message === "insufficient balance") {
                    errorMessage = '⚠️ Payment failed due to insufficient system balance. Try again later or contact support.';
                }
                await sendMessage(sock, sender, errorMessage);
                // Revert points if error occurs
                if (pointsUsed > 0) {
                    console.log(`Refunding ${pointsUsed} points for ${sender} due to STK error`);
                    await updateUserPoints(sender, pointsUsed);
                    await sendMessage(sock, sender, `🌟 ${pointsUsed} points have been refunded due to payment error.`);
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

    return new Promise((resolve) => {
        const interval = setInterval(async () => {
            if (attempts >= maxAttempts) {
                clearInterval(interval);
                await sendMessage(sock, sender, '⏳ Payment status pending. Please check back later or contact support.');
                console.log(`Polling timeout for reference ${reference}`);
                resolve();
                return;
            }

            attempts++;
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
                console.log(`Transaction status for ${reference}: ${JSON.stringify(statusData)}`);

                if (statusData.status === 'SUCCESS' || statusData.status === 'COMPLETED') {
                    clearInterval(interval); // Stop polling immediately
                    const transactionId = statusData.transaction_id || statusData.checkout_request_id || statusData.provider_reference || reference;
                    const pointsUsed = userState.pointsUsed || 0;
                    const finalPrice = item.price - pointsUsed;

                    // Record purchase for daily limit
                    try {
                        await recordPurchase(userState.paymentPhone);
                        console.log(`Purchase recorded for ${userState.paymentPhone}`);
                    } catch (error) {
                        console.error(`Failed to record purchase for ${userState.paymentPhone}:`, error);
                        await sendMessage(sock, sender, '⚠️ Purchase confirmed, but purchase tracking failed. Contact support.');
                    }

                    // Award points: 5% of final price paid (excluding points used)
                    const pointsEarned = Math.floor(finalPrice * 0.05);
                    console.log(`Calculated ${pointsEarned} points for ${sender} (finalPrice: ${finalPrice})`);
                    let updatedPoints;
                    try {
                        if (pointsEarned > 0) {
                            updatedPoints = await updateUserPoints(sender, pointsEarned);
                            console.log(`Awarded ${pointsEarned} points to ${sender}, new total: ${updatedPoints}`);
                        } else {
                            updatedPoints = await getUserPoints(sender);
                            console.log(`No points awarded to ${sender} (finalPrice too low), current points: ${updatedPoints}`);
                        }
                    } catch (error) {
                        console.error(`Failed to award points for ${sender}:`, error);
                        await sendMessage(sock, sender, '⚠️ Purchase confirmed, but points update failed. Contact support.');
                        updatedPoints = await getUserPoints(sender); // Fallback
                    }

                    // Notify user
                    let userMessage = `🎉 Payment of KSh ${finalPrice} confirmed! Transaction ID: ${transactionId}. Your ${item.name} will be processed shortly.\n`;
                    userMessage += `🌟 You earned ${pointsEarned} points for this purchase! ${pointsUsed > 0 ? `(Used ${pointsUsed} points)` : ''} Total Points: ${updatedPoints}`;
                    await sendMessage(sock, sender, userMessage);

                    // Send to admin
                    const adminMessage = `🔔 *New Purchase Confirmed*\n\nOffer: ${item.name}\nOriginal Cost: KSh ${item.price}\nPoints Used: ${pointsUsed}\nAmount Paid: KSh ${finalPrice}\nPhone Number: ${userState.paymentPhone}\nPoints Awarded: ${pointsEarned}\nTotal Points: ${updatedPoints}`;
                    try {
                        await sock.sendMessage(adminNumber, { text: adminMessage });
                        console.log(`Successfully sent purchase details to ${adminNumber}`);
                    } catch (adminError) {
                        console.error(`Failed to send admin message to ${adminNumber}:`, adminError);
                        await sendMessage(sock, sender, '⚠️ Purchase confirmed, but admin notification failed. Contact support.');
                    }

                    // Log purchase
                    await logPurchase(userState.paymentPhone, item, pointsUsed, finalPrice);
                    resolve();
                    return;
                } else if (statusData.status === 'FAILED' || statusData.status === 'CANCELLED') {
                    clearInterval(interval);
                    await sendMessage(sock, sender, `⚠️ Payment failed. Transaction ID: ${reference}. Please retry or contact support.`);
                    // Revert points if used
                    const pointsUsed = userState.pointsUsed || 0;
                    if (pointsUsed > 0) {
                        console.log(`Refunding ${pointsUsed} points for ${sender} due to payment failure`);
                        await updateUserPoints(sender, pointsUsed);
                        await sendMessage(sock, sender, `🌟 ${pointsUsed} points have been refunded due to payment failure.`);
                    }
                    resolve();
                    return;
                }
            } catch (err) {
                console.error(`Polling error for ${reference}:`, err.message);
                if (attempts >= maxAttempts) {
                    clearInterval(interval);
                    await sendMessage(sock, sender, '⏳ Payment status pending. Please check back later or contact support.');
                    resolve();
                }
            }
        }, 5000);
    });
}

async function logPurchase(phone, item, pointsUsed = 0, finalPrice) {
    const timestamp = new Date().toISOString();
    const logEntry = { phone, offer: item.name, originalPrice: item.price, pointsUsed, finalPrice, timestamp, status: 'pending' };
    try {
        const logFile = path.join(__dirname, '../data/purchases.json');
        const logs = await fs.readFile(logFile, 'utf8').catch(() => '[]');
        const purchases = JSON.parse(logs);
        purchases.push(logEntry);
        await fs.writeFile(logFile, JSON.stringify(purchases, null, 2));
        console.log(`Logged purchase: Send ${item.name} (KSh ${item.price}) to ${phone}`);
    } catch (error) {
        console.error(`Failed to log purchase for ${phone}:`, error);
    }
}

module.exports = { bundlesCommand, logPurchase };