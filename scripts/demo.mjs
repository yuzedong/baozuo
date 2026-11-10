import { copyFile, mkdir, writeFile } from 'node:fs/promises';

function makeAudio(notes) {
  const sampleRate = 22050;
  const frames = sampleRate * 16;
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(frames * 2, 40);
  for (let frame = 0; frame < frames; frame++) {
    const seconds = frame / sampleRate;
    const beat = Math.floor(seconds * 2);
    const phase = seconds - beat / 2;
    const frequency = notes[beat % notes.length];
    const envelope = Math.min(1, phase / 0.03) * Math.exp(-phase * 4) * Math.min(1, (16 - seconds) / 2);
    const sample = Math.sin(phase * frequency * 2 * Math.PI) + 0.23 * Math.sin(phase * frequency * 4 * Math.PI);
    wav.writeInt16LE(Math.round(4700 * envelope * sample), 44 + frame * 2);
  }
  return wav;
}

export async function generateDemo(out) {
  const target = out + '/demo-media';
  await mkdir(target);
  await Promise.all([
    writeFile(target + '/morning.wav', makeAudio([261.63, 329.63, 392, 523.25, 440, 392, 329.63, 293.66])),
    writeFile(target + '/sky.wav', makeAudio([196, 246.94, 293.66, 392, 329.63, 293.66, 246.94, 220])),
    copyFile('content/demo-media/morning.mp4', target + '/morning.mp4')
  ]);
}
