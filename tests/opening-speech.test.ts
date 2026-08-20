import assert from "node:assert/strict";
import test from "node:test";

import { buildOpeningSpeechRequest, decodeOpeningSpeechAudio, openingSpeechEndpoint } from "../src/opening-speech.ts";

test("opening speech uses the MiniMax Token Plan Mandarin voice and activity script", () => {
  const request = buildOpeningSpeechRequest("八月 AI 共创场");
  assert.equal(request.model, "speech-2.8-turbo");
  assert.equal(openingSpeechEndpoint, "https://api.minimaxi.com/v1/t2a_v2");
  assert.equal(request.voice_setting.voice_id, "Chinese (Mandarin)_Reliable_Executive");
  assert.equal(request.language_boost, "Chinese");
  assert.equal(request.audio_setting.format, "mp3");
  assert.match(request.text, /八月 AI 共创场/);
});

test("opening speech decodes MiniMax hexadecimal MP3 output", () => {
  assert.deepEqual([...decodeOpeningSpeechAudio("ff004d")], [255, 0, 77]);
  assert.throws(() => decodeOpeningSpeechAudio("not-audio"), /invalid audio/);
});
