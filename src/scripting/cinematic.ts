// Vocabulary shared by the cinematic natives, the script host and the engine.

export const CAMERA_PRESETS = ['establish', 'orbit', 'closeup', 'over_shoulder', 'flyover', 'skyline'] as const;
export type CameraPreset = (typeof CAMERA_PRESETS)[number];

export const MUSIC_MOODS = ['calm', 'tension', 'action', 'chase', 'sorrow', 'hope', 'triumph', 'villain', 'stealth', 'epic', 'none'] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number];

export const WEATHER_KINDS = ['clear', 'rain', 'storm'] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

/** Presets whose target is an NPC id; the others take a place id ("skyline" takes "city"). */
export const NPC_PRESETS: ReadonlySet<CameraPreset> = new Set(['closeup', 'over_shoulder']);

export const isCameraPreset = (s: string): s is CameraPreset => (CAMERA_PRESETS as readonly string[]).includes(s);
export const isMusicMood = (s: string): s is MusicMood => (MUSIC_MOODS as readonly string[]).includes(s);
export const isWeatherKind = (s: string): s is WeatherKind => (WEATHER_KINDS as readonly string[]).includes(s);
