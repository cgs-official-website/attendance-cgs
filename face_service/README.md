# HRMS Face Verification Microservice

This microservice handles face embedding extraction and similarity comparison using DeepFace and OpenCV.

## Architecture

- **Model**: ArcFace (512-dimensional embedding vector)
- **Detector Backend**: OpenCV (`opencv-python-headless`)
- **Metric**: Cosine distance ($1 - \text{cosine\_similarity}$)
- **Default Threshold**: $0.40$ (lower distance indicates higher similarity)
- **Port**: `5002` (bound to `127.0.0.1` locally)

## Security Controls

1. **Authentication**: All endpoints except `/health` require the `X-Internal-Key` HTTP header.
2. **Payload Protection**: Maximum request size is capped at 5 MB.
3. **No Biometric Persistence**: The microservice operates purely in-memory; raw images are decoded, processed, and immediately discarded.
4. **Tenant Isolation**: Handled by the Node.js backend. This microservice only evaluates matching vectors and does not have direct database access.

## Liveness & Anti-Spoofing Limitation Notice

> **Important**: Standard 2D facial embedding comparison (ArcFace/DeepFace) extracts facial landmark features for identity matching. It **does NOT** reliably differentiate between a real human face and a printed photograph or mobile screen replay. For true presentation attack detection (PAD), a hardware-backed 3D sensor or an active challenge-response liveness service (such as AWS Rekognition Face Liveness) is required.

## Running the Microservice

```bash
cd face_service
python app.py
```
