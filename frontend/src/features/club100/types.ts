export type Song = {
  url: string;
  title: string;
  artist?: string;
  duration?: number;
  thumbnail?: string;
  start?: number;
};

export type Snippet = {
  type: 'tts' | 'upload';
  text?: string;
  audioUrl?: string;
};

export type Club100Job = {
  jobId: string;
  status: 'processing' | 'done' | 'error';
  downloadUrl?: string;
  workerOutput?: string;
};

export type LanguageOption = {
  code: string;
  label: string;
};

export type Effect = {
  id: string;
  name: string;
  audioUrl: string;
};

export type TrackItem =
  | { type: 'song'; song: Song }
  | { type: 'snippet'; snippet: Snippet }
  | { type: 'effect'; effect: Effect }; 