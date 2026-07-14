const WHISPER_SAMPLE_RATE = 16000;

/**
 * Decode a recorded audio blob into 16 kHz mono PCM for Whisper.
 * AudioContext resamples during decode when constructed with a sampleRate.
 */
export async function blobToPCM(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: WHISPER_SAMPLE_RATE });
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    if (decoded.numberOfChannels === 1) {
      return decoded.getChannelData(0).slice();
    }
    const left = decoded.getChannelData(0);
    const right = decoded.getChannelData(1);
    const mono = new Float32Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) mono[i] = (left[i] + right[i]) / 2;
    return mono;
  } finally {
    void ctx.close();
  }
}

export function pickRecordingMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  if (typeof MediaRecorder === 'undefined') return undefined;
  return candidates.find((m) => MediaRecorder.isTypeSupported(m));
}
