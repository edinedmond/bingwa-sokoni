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
        const newPoints = Math.max(0, currentPoints + pointsToAdd);
        await userRef.update({ points: newPoints });
        console.log(`Updated points for ${sender}: ${newPoints} (changed by ${pointsToAdd})`);
        return newPoints;
    } catch (error) {
        console.error(`Failed to update points for ${sender}:`, error);
        throw error;
    }
}

async function canMakePurchase(phoneNumber, serviceType) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const serviceCollection = {
            dataOffers: 'data',
            smsOffers: 'sms',
            talktimeOffers: 'talktime'
        }[serviceType];

        if (!serviceCollection) {
            throw new Error(`Invalid service type: ${serviceType}`);
        }

        const purchaseRef = purchasesCollection
            .doc(phoneNumber)
            .collection(serviceCollection)
            .doc(today);

        const purchaseDoc = await purchaseRef.get();
        if (purchaseDoc.exists) {
            console.log(`Purchase blocked for ${phoneNumber} on ${serviceType}: Already purchased today`);
            return false;
        }

        console.log(`Allowing purchase for ${phoneNumber} on ${serviceType}`);
        return true;
    } catch (error) {
        console.error(`Failed to check purchase eligibility for ${phoneNumber} on ${serviceType}:`, error);
        return false;
    }
}

async function recordPurchase(phoneNumber, serviceType) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const serviceCollection = {
            dataOffers: 'data',
            smsOffers: 'sms',
            talktimeOffers: 'talktime'
        }[serviceType];

        if (!serviceCollection) {
            throw new Error(`Invalid service type: ${serviceType}`);
        }

        const purchaseRef = purchasesCollection
            .doc(phoneNumber)
            .collection(serviceCollection)
            .doc(today);

        await purchaseRef.set({
            lastPurchaseDate: admin.firestore.Timestamp.now(),
            resetDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000))
        });
        console.log(`Recorded purchase for ${phoneNumber} on ${serviceType}, resets tomorrow`);
    } catch (error) {
        console.error(`Failed to record purchase for ${phoneNumber} on ${serviceType}:`, error);
        throw error;
    }
}

module.exports = { getUserPoints, updateUserPoints, canMakePurchase, recordPurchase };