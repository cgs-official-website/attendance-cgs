const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Path to the service account key (User must place it here)
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'serviceAccountKey.json');
const OUTPUT_DIR = path.join(__dirname, 'hrms');
const OUTPUT_ZIP = path.join(__dirname, 'hrms.zip');

async function main() {
    console.log("Starting Firebase Backup...");

    if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
        console.error(`\n[ERROR] Service Account Key not found at: ${SERVICE_ACCOUNT_PATH}`);
        console.error("Please download it from Firebase Console -> Project Settings -> Service Accounts, rename it to 'serviceAccountKey.json' and place it in the project root.");
        process.exit(1);
    }

    const serviceAccount = require(SERVICE_ACCOUNT_PATH);

    initializeApp({
        credential: cert(serviceAccount)
    });

    const db = getFirestore();
    
    // Create output directory
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR);
    }

    console.log("Fetching all collections...");
    const collections = await db.listCollections();
    const allData = {};
    const usersMap = {}; // userId -> companyId
    const channelsMap = {}; // channelId -> companyId
    const tasksMap = {}; // taskId -> companyId

    for (const collection of collections) {
        console.log(`Reading collection: ${collection.id}...`);
        allData[collection.id] = [];
        const snapshot = await collection.get();
        snapshot.forEach(doc => {
            const data = doc.data();
            data._id = doc.id; // Store document ID
            allData[collection.id].push(data);

            // Build reference maps for documents that might not have companyId directly
            if (collection.id === 'users' && data.companyId) {
                usersMap[doc.id] = data.companyId;
            } else if (collection.id === 'channels' && data.companyId) {
                channelsMap[doc.id] = data.companyId;
            } else if (collection.id === 'tasks' && data.companyId) {
                tasksMap[doc.id] = data.companyId;
            }
        });
    }

    console.log("Organizing data by company...");
    const companies = allData['companies'] || [];
    const groupedByCompany = {};

    companies.forEach(company => {
        const companyName = company.name || company.companyName || `Unknown Company ${company._id}`;
        groupedByCompany[company._id] = {
            companyInfo: company,
            data: {}
        };
    });

    const unassignedData = {};

    for (const [collectionName, docs] of Object.entries(allData)) {
        if (collectionName === 'companies') continue;

        docs.forEach(doc => {
            let assignedCompanyId = doc.companyId;

            // Resolve companyId based on relationships if not directly present
            if (!assignedCompanyId) {
                if (doc.userId && usersMap[doc.userId]) {
                    assignedCompanyId = usersMap[doc.userId];
                } else if (doc.channelId && channelsMap[doc.channelId]) {
                    assignedCompanyId = channelsMap[doc.channelId];
                } else if (doc.taskId && tasksMap[doc.taskId]) {
                    assignedCompanyId = tasksMap[doc.taskId];
                }
            }

            if (assignedCompanyId && groupedByCompany[assignedCompanyId]) {
                if (!groupedByCompany[assignedCompanyId].data[collectionName]) {
                    groupedByCompany[assignedCompanyId].data[collectionName] = [];
                }
                groupedByCompany[assignedCompanyId].data[collectionName].push(doc);
            } else {
                if (!unassignedData[collectionName]) {
                    unassignedData[collectionName] = [];
                }
                unassignedData[collectionName].push(doc);
            }
        });
    }

    console.log("Writing JSON files...");
    
    // Write company specific data
    for (const [companyId, companyObj] of Object.entries(groupedByCompany)) {
        const companyName = companyObj.companyInfo.name || companyObj.companyInfo.companyName || `Company_${companyId}`;
        const filePath = path.join(OUTPUT_DIR, `${companyName}.json`);
        fs.writeFileSync(filePath, JSON.stringify(companyObj, null, 2));
        console.log(`Created: ${filePath}`);
    }

    // Write unassigned/global data just in case
    if (Object.keys(unassignedData).length > 0) {
        const filePath = path.join(OUTPUT_DIR, 'Global_Unassigned_Data.json');
        fs.writeFileSync(filePath, JSON.stringify(unassignedData, null, 2));
        console.log(`Created: ${filePath}`);
    }

    console.log("Zipping the backup...");
    await zipDirectory(OUTPUT_DIR, OUTPUT_ZIP);
    console.log(`\n[SUCCESS] Backup completed successfully!`);
    console.log(`Zip file saved at: ${OUTPUT_ZIP}`);
    
    // Cleanup JSON files optionally (we can leave the hrms folder or delete it, let's leave it for now)
    // fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
}

function zipDirectory(sourceDir, outPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outPath);
        const archive = new archiver.ZipArchive({ zlib: { level: 9 } });

        output.on('close', () => resolve());
        archive.on('error', (err) => reject(err));

        archive.pipe(output);
        archive.directory(sourceDir, 'hrms');
        archive.finalize();
    });
}

main().catch(console.error);
