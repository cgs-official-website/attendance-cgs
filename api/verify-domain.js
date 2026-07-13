import dns from 'dns';
import util from 'util';
import admin from 'firebase-admin';

const resolveTxt = util.promisify(dns.resolveTxt);

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    // Attempt to initialize using standard FIREBASE_ environment variables that Firebase Admin expects
    // Usually on Vercel you'd set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
    if (process.env.FIREBASE_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          // Replace escaped newlines so the key parses correctly
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    } else {
      // Fallback: If no env vars, attempt to use default credentials (will fail in Vercel production without vars)
      admin.initializeApp();
    }
  } catch (error) {
    console.error('Firebase Admin Initialization Error:', error);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { domainId, domainName } = req.body;

    if (!domainId || !domainName) {
      return res.status(400).json({ error: 'Missing domainId or domainName' });
    }

    // 1. Fetch the domain document from Firestore
    const db = admin.firestore();
    const domainDocRef = db.collection('companyDomains').doc(domainId);
    const domainDoc = await domainDocRef.get();

    if (!domainDoc.exists) {
      return res.status(404).json({ error: 'Domain record not found' });
    }

    const domainData = domainDoc.data();
    
    if (domainData.status === 'VERIFIED') {
      return res.status(200).json({ success: true, message: 'Domain is already verified' });
    }

    const expectedToken = domainData.verificationToken;

    // 2. Perform DNS TXT Lookup
    let isVerified = false;
    try {
      const records = await resolveTxt(domainName);
      
      // Node returns an array of arrays for TXT: [ ['record1part1', 'part2'], ['record2'] ]
      const flatRecords = records.map(recordArray => recordArray.join(''));
      
      if (flatRecords.includes(expectedToken)) {
        isVerified = true;
      }
    } catch (dnsError) {
      console.error(`DNS lookup failed for ${domainName}:`, dnsError);
      return res.status(400).json({ error: 'Failed to look up DNS records. Please ensure they are propagated.', details: dnsError.message });
    }

    // 3. Update Firestore if verified
    if (isVerified) {
      await domainDocRef.update({
        status: 'VERIFIED',
        verifiedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return res.status(200).json({ success: true, message: 'Domain successfully verified!' });
    } else {
      return res.status(400).json({ error: 'Verification token not found in DNS records. Please wait for DNS propagation.' });
    }

  } catch (error) {
    console.error('Domain verification handler error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
