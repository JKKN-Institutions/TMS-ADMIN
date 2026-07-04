// Send a test push to ONE subscription. Usage:
//   node -r dotenv/config scripts/test-push.js '<subscription-json>'
// where <subscription-json> is { "endpoint": "...", "keys": { "p256dh": "...", "auth": "..." } }
// (copy a row from tms_push_subscription). Falls back to reading VAPID from process.env.
const webpush = require('web-push');

const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const priv = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || 'mailto:transport@jkkn.ac.in';
if (!pub || !priv) {
  console.error('Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in the environment.');
  process.exit(1);
}
webpush.setVapidDetails(subject, pub, priv);

const sub = JSON.parse(process.argv[2] || '{}');
webpush
  .sendNotification(
    sub,
    JSON.stringify({ title: 'JKKN TMS test', body: 'Push is working 🎉', url: '/', icon: '/icons/icon-192.png', tag: 'test' })
  )
  .then(() => console.log('✓ sent'))
  .catch((e) => { console.error('✗ failed', e.statusCode, e.body); process.exit(1); });
