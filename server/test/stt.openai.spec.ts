import { describe, expect, it } from 'vitest'
import {
  buildOpenAiAudioAppendEvent,
  buildOpenAiTranscriptionSessionUpdate,
  createOpenAiTranscriptNormalizer,
  createPcm16Resampler16To24,
  OPENAI_TRANSCRIBE_MODEL,
} from '../src/routes/stt.openai.js'

function pcm16(samples: number[]): Uint8Array {
  const buffer = new ArrayBuffer(samples.length * 2)
  const view = new DataView(buffer)
  samples.forEach((sample, index) => view.setInt16(index * 2, sample, true))
  return new Uint8Array(buffer)
}

function samplesFrom(bytes: Uint8Array): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return Array.from({ length: bytes.byteLength / 2 }, (_, index) => view.getInt16(index * 2, true))
}

describe('OpenAI realtime STT proxy helpers', () => {
  it('builds a transcription-only OpenAI session update', () => {
    const update = buildOpenAiTranscriptionSessionUpdate()
    expect(update.session.type).toBe('transcription')
    expect(update.session.audio.input.format).toEqual({ type: 'audio/pcm', rate: 24000 })
    expect(update.session.audio.input.transcription.model).toBe(OPENAI_TRANSCRIBE_MODEL)
    expect(update.session.audio.input.transcription.language).toBe('en')
    expect(update.session.audio.input.turn_detection.type).toBe('server_vad')
  })

  it('resamples 16 kHz PCM16 chunks to a 24 kHz-sized stream', () => {
    const resampler = createPcm16Resampler16To24()
    const output = resampler.resample(pcm16([0, 900, 1800, 3000]))
    expect(samplesFrom(output)).toEqual([0, 600, 900, 1800, 2600, 3000])
  })

  it('accumulates deltas and finalizes completed OpenAI transcription items', () => {
    const normalize = createOpenAiTranscriptNormalizer()
    expect(normalize({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'item_1',
      delta: 'hello ',
    })).toEqual({ type: 'transcript.delta', itemId: 'item_1', text: 'hello ' })
    expect(normalize({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'item_1',
      delta: 'there',
    })).toEqual({ type: 'transcript.delta', itemId: 'item_1', text: 'hello there' })
    expect(normalize({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item_1',
      transcript: 'hello there',
    })).toEqual({ type: 'transcript.final', itemId: 'item_1', text: 'hello there' })
  })

  it('encodes audio only inside OpenAI STT append events', () => {
    const event = buildOpenAiAudioAppendEvent(pcm16([1, 2]))
    expect(event.type).toBe('input_audio_buffer.append')
    expect(event.audio).toBe(Buffer.from(pcm16([1, 2])).toString('base64'))
  })
})
