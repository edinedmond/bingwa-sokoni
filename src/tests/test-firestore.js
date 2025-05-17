const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyAU8gEmMiFxXKP41Y4HoCjeXtPPUlmJmsg",
  authDomain: "bingwa-sokoni-4d19c.firebaseapp.com",
  projectId: "bingwa-sokoni-4d19c",
  storageBucket: "bingwa-sokoni-4d19c.firebasestorage.app",
  messagingSenderId: "476657740766",
  appId: "1:476657740766:web:4c2d074dc88b88b1b30b4f",
  measurementId: "G-49Q02KF5ET"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testFirestore() {
  const userId = 'testuser@s.whatsapp.net';
  try {
    // Write points
    await setDoc(doc(db, 'users', userId), { points: 15 });
    console.log(`Set points for ${userId}`);

    // Read points
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      console.log(`Points for ${userId}: ${userDoc.data().points}`);
    } else {
      console.log(`No data for ${userId}`);
    }
  } catch (error) {
    console.error('Firestore error:', error);
  }
}

testFirestore();