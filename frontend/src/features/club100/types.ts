export type Song = {
  url: string;
  title: string;
  artist?: string;
  duration?: number;
  thumbnail?: string;
  start?: number;
};

// Snippets are user-supplied audio (recorded or uploaded). TTS has been removed.
export type Snippet = {
  type: 'upload';
  audioUrl?: string;
};

export type Club100Job = {
  jobId: string;
  status: 'processing' | 'done' | 'error';
  downloadUrl?: string;
};

export type Effect = {
  id: string;
  name: string;
  audioUrl: string;
};

// Every track item carries a stable `id` so React keys / drag-and-drop ids
// track item identity rather than array position.
export type TrackItem = { id: string } & (
  | { type: 'song'; song: Song }
  | { type: 'snippet'; snippet: Snippet }
  | { type: 'effect'; effect: Effect }
);
