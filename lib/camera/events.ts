export const cameraEventTypes = ["FACE_VERIFIED", "FACE_MISSING", "MULTIPLE_FACES", "CAMERA_OBSCURED", "CAMERA_STALLED", "CAMERA_LOST", "CAMERA_RESTORED", "VIEWER_BLURRED", "VIEWER_LOCKED", "VIEWER_UNLOCKED"] as const;
export type CameraEventType = (typeof cameraEventTypes)[number];
