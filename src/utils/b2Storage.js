import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Ensure environment variables exist
const bucketName = import.meta.env.VITE_B2_BUCKET_NAME;
const endpoint = import.meta.env.VITE_B2_ENDPOINT;
const accessKeyId = import.meta.env.VITE_B2_ACCESS_KEY_ID;
const secretAccessKey = import.meta.env.VITE_B2_SECRET_ACCESS_KEY;

// Check if B2 is configured
export const isB2Configured = () => {
  return !!(bucketName && endpoint && accessKeyId && secretAccessKey);
};

let s3Client = null;

if (isB2Configured()) {
  // Extract region from endpoint if possible (e.g. s3.us-west-004.backblazeb2.com -> us-west-004)
  // If not, default to us-east-1 to satisfy AWS SDK
  let region = "us-east-1";
  try {
    if (endpoint.includes("s3.")) {
      region = endpoint.split("s3.")[1].split(".")[0];
    }
  } catch (e) {
    // Ignore
  }

  s3Client = new S3Client({
    endpoint: endpoint,
    region: region,
    credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
    },
    // Required for some B2 regions when using standard S3 SDKs
    forcePathStyle: true, 
  });
}

/**
 * Upload a file to Backblaze B2 using S3 API
 * @param {File} file 
 * @returns {Promise<{ id: string, name: string, url: string, mimeType: string, size: number }>}
 */
export const uploadFileToB2 = async (file) => {
  if (!s3Client) {
    throw new Error("Backblaze B2 is not configured properly in .env");
  }

  try {
    const fileExtension = file.name.split(".").pop() || "bin";
    const uniqueFileName = `files/${Math.random().toString(36).substring(2, 11)}_${Date.now()}.${fileExtension}`;

    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: uniqueFileName,
      Body: new Uint8Array(arrayBuffer),
      ContentType: file.type || "application/octet-stream",
    });

    await s3Client.send(command);

    // B2 path-style public URL: https://s3.us-west-004.backblazeb2.com/bucketname/files/filename
    const baseUrl = endpoint.startsWith("http") ? endpoint : `https://${endpoint}`;
    const publicUrl = `${baseUrl}/${bucketName}/${uniqueFileName}`;
    
    return {
      id: uniqueFileName,
      name: file.name,
      url: publicUrl,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      isB2: true
    };
  } catch (error) {
    console.error("Error uploading to Backblaze B2:", error);
    throw new Error("Failed to upload file to Backblaze B2. " + error.message);
  }
};
