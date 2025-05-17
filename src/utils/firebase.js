const admin = require('firebase-admin');
const path = require('path');

let serviceAccount;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        console.log('Loading Firebase service account from environment variable');
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        const serviceAccountPath = path.join(__dirname, '../config/serviceAccountKey.json');
        console.log('Loading service account from:', serviceAccountPath);
        serviceAccount = require(serviceAccountPath);
    }
    console.log('Service account loaded successfully');
} catch (error) {
    console.error('Failed to load service account:', error);
    throw error;
}

try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://bingwa-sokoni-4d19c.firebaseio.com'
    });
    console.log('Firebase initialized successfully');
} catch (error) {
    console.error('Failed to initialize Firebase:', error);
    throw error;
}

const db = admin.firestore();
const usersCollection = db.collection('users');
const purchasesCollection = db.collection('purchases');

async function getUserPoints(sender) {
    try {
        const userDoc = await usersCollection.doc(sender).get();
        if (userDoc.exists) return userDoc.data().points || 0;
        await usersCollection.doc(sender).set({ points: 0 });
        return 0;
    } catch (error) {
        console.error(`Failed to fetch points for ${sender}:`, error);
        return 0;
    }
}

async function updateUserPoints(sender, pointsToAdd) {
    try {
        const userRef = usersCollection.doc(sender);
        const userDoc = await userRef.get();
        let currentPoints = 0;
        if (userDoc.exists) currentPoints = userDoc.data().points || 0;
        else await userRef.set({ points: 0 });
        const newPoints = Math.max(0, currentPoints + pointsToAdd); // Prevent negative points
        await userRef.update({ points: newPoints });
        console.log(`Updated points for ${sender}: ${newPoints} (changed by ${pointsToAdd})`);
        return newPoints;
    } catch (error) {
        console.error(`Failed to update points for ${sender}:`, error);
        throw error;
    }
}

async function canMakePurchase(phoneNumber) {
    try {
        const purchaseDoc = await purchasesCollection.doc(phoneNumber).get();
        const currentDate = new Date();
        const today = currentDate.toISOString().split('T')[0]; // e.g., "2025-05-17"

        if (!purchaseDoc.exists) {
            console.log(`No purchase history for ${phoneNumber}, allowing purchase`);
            return true;
        }

        const { lastPurchaseDate, resetDate } = purchaseDoc.data();
        const lastPurchase = lastPurchaseDate.toDate();
        const lastPurchaseDateStr = lastPurchase.toISOString().split('T')[0];

        if (today >= resetDate) {
            console.log(`Resetting purchase limit for ${phoneNumber}, last reset: ${resetDate}`);
            await purchasesCollection.doc(phoneNumber).delete();
            return true;
        }

        if (lastPurchaseDateStr === today) {
            console.log(`Purchase blocked for ${phoneNumber}: Already purchased today`);
            return false;
        }

        console.log(`Allowing purchase for ${phoneNumber}, last purchase: ${lastPurchaseDateStr}`);
        return true;
    } catch (error) {
        console.error(`Failed to check purchase eligibility for ${phoneNumber}:`, error);
        return false;
    }
}

async function recordPurchase(phoneNumber) {
    try {
        const currentDate = new Date();
        const tomorrow = new Date(currentDate);
        tomorrow.setDate(currentDate.getDate() + 1);
        const resetDate = tomorrow.toISOString().split('T')[0]; // e.g., "2025-05-18"

        await purchasesCollection.doc(phoneNumber).set({
            lastPurchaseDate: admin.firestore.Timestamp.fromDate(currentDate),
            resetDate: resetDate
        });
        console.log(`Recorded purchase for ${phoneNumber}, resets on ${resetDate}`);
    } catch (error) {
        console.error(`Failed to record purchase for ${phoneNumber}:`, error);
        throw error;
    }
}

module.exports = { getUserPoints, updateUserPoints, canMakePurchase, recordPurchase };