import { useEffect, useRef, useState } from "react";

export default function CameraCapture({
  onCapture,
  onCancel,
  busy = false,
  title = "Identity Verification",
  description = "Face the camera directly in good lighting. Only one person may be in the frame.",
  captureLabel = "Capture Selfie",
  previewBeforeCapture = false,
  footer = null
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");

  useEffect(() => {
    let mounted = true;
    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera access is not supported by this browser.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
          audio: false
        });
        if (!mounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        setError(err.name === "NotAllowedError"
          ? "Camera permission was denied. Please allow camera access in browser settings and try again."
          : "Camera device is unavailable. Please check your camera connection.");
      }
    };
    startCamera();
    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    };
  }, []);

  const capture = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) {
      setError("Camera is not ready yet. Please wait a moment and try again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const image = canvas.toDataURL("image/jpeg", 0.88);
    if (previewBeforeCapture) {
      setPreview(image);
    } else {
      onCapture(image);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-bg-card border border-border-card p-5 shadow-2xl">
        <h2 className="text-lg font-extrabold text-text-main">{title}</h2>
        <p className="mt-1 text-xs text-text-sec">
          {description}
        </p>

        {/* Dedicated camera/preview container ensuring proper height and aspect-ratio */}
        <div className="relative mt-4 w-full aspect-square min-h-[300px] max-h-[380px] overflow-hidden rounded-xl bg-black flex items-center justify-center">
          {preview ? (
            <img
              src={preview}
              alt="Selfie preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          )}
        </div>

        {error && <p className="mt-3 text-xs font-semibold text-red-500">{error}</p>}

        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-border-card px-4 py-2 text-xs font-bold text-text-sec hover:bg-bg-hover transition-colors"
          >
            Cancel
          </button>
          {preview && (
            <button
              type="button"
              onClick={() => setPreview("")}
              disabled={busy}
              className="rounded-xl border border-border-card px-4 py-2 text-xs font-bold text-text-sec hover:bg-bg-hover transition-colors disabled:opacity-50"
            >
              Retake
            </button>
          )}
          <button
            type="button"
            onClick={() => preview ? onCapture(preview) : capture()}
            disabled={busy}
            className="rounded-xl bg-brand-primary px-4 py-2 text-xs font-bold text-white hover:bg-brand-hover transition-colors disabled:opacity-50"
          >
            {busy ? "Processing..." : (preview ? "Confirm & Submit" : captureLabel)}
          </button>
        </div>

        {footer && <div className="mt-3">{footer}</div>}
      </div>
    </div>
  );
}
