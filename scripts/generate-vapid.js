// One-off VAPID keypair generator for web push. Run: node scripts/generate-vapid.js
// Paste the output into .env (keep VAPID_PRIVATE_KEY server-only) and mirror the
// KEYS (not values) into .env.local.example.
const webpush = require('web-push');
const keys = webpush.generateVAPIDKeys();
console.log('NEXT_PUBLIC_VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
console.log('VAPID_SUBJECT=mailto:transport@jkkn.ac.in');
