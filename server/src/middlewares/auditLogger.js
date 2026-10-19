import { extractRequestMetadata } from "../utils/deviceDetector.js";
import auditService from "../services/auditService.js";

/**
 * Middleware to enrich requests with device and IP metadata,
 * and provide a standardized req.auditLog() helper.
 */
export const auditEnricher = (req, res, next) => {
  const metadata = extractRequestMetadata(req);
  req.clientMetadata = metadata;

  req.auditLog = (options) => {
    auditService.logAudit({
      req,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      ...options
    });
  };

  next();
};

export default auditEnricher;
