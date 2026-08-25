/**
 * Generates the bundled alert sounds as plain PCM WAV files.
 * Origin/licensing: pure sine-wave beeps synthesized by this script —
 * no third-party samples, public domain. Re-run: node scripts/generate-sounds.js
 */
const fs = require('fs')
const path = require('path')

const SAMPLE_RATE = 44100

function tone(freq, seconds, gain) {
  const n = Math.floor(SAMPLE_RATE * seconds)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    // Quick attack, exponential decay — terminal-style blip.
    const t = i / SAMPLE_RATE
    const env = Math.min(1, t / 0.005) * Math.exp(-t * 12)
    out[i] = Math.sin(2 * Math.PI * freq * t) * env * gain
  }
  return out
}

function silence(seconds) {
  return new Float32Array(Math.floor(SAMPLE_RATE * seconds))
}

function concat(parts) {
  const total = parts.reduce((a, p) => a + p.length, 0)
  const out = new Float32Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

function toWav(samples) {
  const data = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i++) {
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), i * 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

const outDir = path.join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'sounds')
fs.mkdirSync(outDir, { recursive: true })

// default: friendly double blip
const def = concat([tone(880, 0.16, 0.6), silence(0.06), tone(1174.7, 0.18, 0.6)])
fs.writeFileSync(path.join(outDir, 'alert-default.wav'), toWav(def))

// urgent: sharp triple blip
const urgent = concat([tone(1244.5, 0.12, 0.75), silence(0.05), tone(1244.5, 0.12, 0.75), silence(0.05), tone(1661.2, 0.2, 0.75)])
fs.writeFileSync(path.join(outDir, 'alert-urgent.wav'), toWav(urgent))

console.log('wrote', outDir)
