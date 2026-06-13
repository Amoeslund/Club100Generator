// Base URL of the Python audio-worker backend.
// Configurable for deployment; falls back to the local dev server.
export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:5001';
