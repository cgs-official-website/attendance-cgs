/**
 * Device and IP Parser Utility
 * Extracts clean IP addresses and parses User-Agent strings into device, browser, and OS info.
 */

export const getClientIp = (req) => {
  if (!req) return "unknown";

  const forwarded = req.headers?.["x-forwarded-for"];
  let ip = null;

  if (forwarded) {
    // In proxy setups, x-forwarded-for may contain multiple IPs: "client, proxy1, proxy2"
    ip = forwarded.split(",")[0].trim();
  } else if (req.headers?.["x-real-ip"]) {
    ip = req.headers["x-real-ip"];
  } else if (req.ip) {
    ip = req.ip;
  } else if (req.socket?.remoteAddress) {
    ip = req.socket.remoteAddress;
  }

  if (!ip) return "127.0.0.1";

  // Normalize IPv6 mapped IPv4 addresses
  if (ip === "::1" || ip === "::ffff:127.0.0.1") {
    return "127.0.0.1";
  }
  if (ip.startsWith("::ffff:")) {
    return ip.replace("::ffff:", "");
  }

  return ip;
};

export const parseUserAgent = (userAgentString) => {
  const ua = userAgentString || "";

  let browser = "Unknown Browser";
  let os = "Unknown OS";
  let deviceType = "Desktop";

  // OS Detection
  if (/windows phone/i.test(ua)) {
    os = "Windows Phone";
    deviceType = "Mobile";
  } else if (/win/i.test(ua)) {
    if (/nt 10.0/i.test(ua)) os = "Windows 10/11";
    else if (/nt 6.3/i.test(ua)) os = "Windows 8.1";
    else if (/nt 6.2/i.test(ua)) os = "Windows 8";
    else if (/nt 6.1/i.test(ua)) os = "Windows 7";
    else os = "Windows";
  } else if (/android/i.test(ua)) {
    os = "Android";
    deviceType = "Mobile";
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    os = /ipad/i.test(ua) ? "iPadOS" : "iOS";
    deviceType = /ipad/i.test(ua) ? "Tablet" : "Mobile";
  } else if (/macintosh|mac os x/i.test(ua)) {
    os = "macOS";
  } else if (/linux/i.test(ua)) {
    os = "Linux";
  } else if (/cros/i.test(ua)) {
    os = "ChromeOS";
  }

  // Browser Detection
  if (/edg\//i.test(ua)) {
    browser = "Edge";
  } else if (/opr\/|opera/i.test(ua)) {
    browser = "Opera";
  } else if (/chrome|crios/i.test(ua)) {
    browser = "Chrome";
  } else if (/firefox|fxios/i.test(ua)) {
    browser = "Firefox";
  } else if (/safari/i.test(ua) && !/chrome|crios|android/i.test(ua)) {
    browser = "Safari";
  } else if (/postman/i.test(ua)) {
    browser = "Postman";
  } else if (/curl/i.test(ua)) {
    browser = "cURL";
  }

  const deviceName = `${browser} on ${os}`;

  return {
    browser,
    os,
    deviceType,
    deviceName
  };
};

export const extractRequestMetadata = (req) => {
  const ipAddress = getClientIp(req);
  const userAgent = req?.headers?.["user-agent"] || "";
  const device = parseUserAgent(userAgent);

  return {
    ipAddress,
    userAgent,
    ...device
  };
};
