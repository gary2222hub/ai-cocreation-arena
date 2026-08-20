import { buildOpeningScript } from "./live-guidance.ts";

export const openingSpeechSettings = {
  model: "speech-2.8-turbo",
  voiceId: "Chinese (Mandarin)_Reliable_Executive",
} as const;

export const openingSpeechEndpoint = "https://api.minimaxi.com/v1/t2a_v2";

export function buildOpeningSpeechRequest(activityName: string) {
  return {
    model: openingSpeechSettings.model,
    text: buildOpeningScript(activityName),
    stream: false,
    language_boost: "Chinese",
    output_format: "hex",
    voice_setting: {
      voice_id: openingSpeechSettings.voiceId,
      speed: 1,
      vol: 1,
      pitch: 0,
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: "mp3",
      channel: 1,
    },
  };
}

export function decodeOpeningSpeechAudio(hex: string) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) {
    throw new Error("MiniMax returned invalid audio data.");
  }
  const audio = new Uint8Array(hex.length / 2);
  for (let index = 0; index < audio.length; index += 1) {
    audio[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return audio;
}
