export type AudioPlaybackPreferences = {
  volume: number;
  muted: boolean;
};

let preferences: AudioPlaybackPreferences = {
  volume: 1,
  muted: false,
};

export const getAudioPlaybackPreferences = (): AudioPlaybackPreferences => ({
  ...preferences,
});

export const setAudioPlaybackPreferences = (
  next: AudioPlaybackPreferences,
): AudioPlaybackPreferences => {
  preferences = {
    volume: Math.max(0, Math.min(1, next.volume)),
    muted: next.muted,
  };
  return getAudioPlaybackPreferences();
};
