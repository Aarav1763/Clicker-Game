// cloud_function.js - example Firebase Cloud Function (Node) for resetting daily bosses
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

// Runs daily at 00:05 UTC
exports.resetDailyBoss = functions.pubsub.schedule('5 0 * * *').timeZone('UTC').onRun(async (context) => {
  const clans = await db.collection('clans').get();
  for(const c of clans.docs){
    const size = (c.data().members || []).length || 1;
    const maxHp = Math.floor(1000 * Math.pow(1.15, (size-1)));
    const soulsReward = 50 + Math.floor(size * 10);
    await c.ref.collection('boss').doc('current').set({
      maxHp,
      hp: maxHp,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 24*3600*1000)),
      soulsReward,
      totalDamage: 0
    }, { merge: true });
  }
  return null;
});
