import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWavHeader, MusicGenerator } from './musicGenerator.js';
import type { MusicDirection } from '@robcost/shared-types';

// ────────────────────────────────────────────────────────────────
// WAV header tests
// ────────────────────────────────────────────────────────────────

describe('createWavHeader', () => {
  it('returns a 44-byte buffer', () => {
    const header = createWavHeader(1000, 48000, 2, 16);
    expect(header.length).toBe(44);
  });

  it('starts with RIFF identifier', () => {
    const header = createWavHeader(1000, 48000, 2, 16);
    expect(header.toString('ascii', 0, 4)).toBe('RIFF');
  });

  it('has WAVE format', () => {
    const header = createWavHeader(1000, 48000, 2, 16);
    expect(header.toString('ascii', 8, 12)).toBe('WAVE');
  });

  it('has fmt sub-chunk', () => {
    const header = createWavHeader(1000, 48000, 2, 16);
    expect(header.toString('ascii', 12, 16)).toBe('fmt ');
  });

  it('has data sub-chunk', () => {
    const header = createWavHeader(1000, 48000, 2, 16);
    expect(header.toString('ascii', 36, 40)).toBe('data');
  });

  it('encodes correct ChunkSize (file size - 8)', () => {
    const dataLength = 1000;
    const header = createWavHeader(dataLength, 48000, 2, 16);
    // ChunkSize = 36 + dataLength
    expect(header.readUInt32LE(4)).toBe(36 + dataLength);
  });

  it('encodes PCM audio format (1)', () => {
    const header = createWavHeader(1000, 48000, 2, 16);
    expect(header.readUInt16LE(20)).toBe(1);
  });

  it('encodes correct number of channels', () => {
    const header = createWavHeader(1000, 48000, 2, 16);
    expect(header.readUInt16LE(22)).toBe(2);

    const monoHeader = createWavHeader(1000, 44100, 1, 16);
    expect(monoHeader.readUInt16LE(22)).toBe(1);
  });

  it('encodes correct sample rate', () => {
    const header = createWavHeader(1000, 48000, 2, 16);
    expect(header.readUInt32LE(24)).toBe(48000);
  });

  it('encodes correct byte rate (sampleRate * channels * bitsPerSample/8)', () => {
    const header = createWavHeader(1000, 48000, 2, 16);
    // 48000 * 2 * 2 = 192000
    expect(header.readUInt32LE(28)).toBe(192000);
  });

  it('encodes correct block align (channels * bitsPerSample/8)', () => {
    const header = createWavHeader(1000, 48000, 2, 16);
    // 2 * 2 = 4
    expect(header.readUInt16LE(32)).toBe(4);
  });

  it('encodes correct bits per sample', () => {
    const header = createWavHeader(1000, 48000, 2, 16);
    expect(header.readUInt16LE(34)).toBe(16);
  });

  it('encodes correct data sub-chunk size', () => {
    const dataLength = 5760;
    const header = createWavHeader(dataLength, 48000, 2, 16);
    expect(header.readUInt32LE(40)).toBe(dataLength);
  });
});

// ────────────────────────────────────────────────────────────────
// MusicGenerator class tests
// ────────────────────────────────────────────────────────────────

describe('MusicGenerator', () => {
  describe('constructor', () => {
    it('creates an instance with default config', () => {
      const gen = new MusicGenerator('test-key');
      expect(gen).toBeDefined();
    });

    it('accepts custom stream duration', () => {
      const gen = new MusicGenerator('test-key', 10);
      expect(gen).toBeDefined();
    });

    it('accepts custom cost per track', () => {
      const gen = new MusicGenerator('test-key', 30, 0.05);
      expect(gen).toBeDefined();
    });
  });

  describe('buildWeightedPrompts', () => {
    let gen: MusicGenerator;

    beforeEach(() => {
      gen = new MusicGenerator('test-key');
    });

    it('creates a single weighted prompt from music direction', () => {
      const direction: MusicDirection = {
        genre: 'chiptune',
        mood: 'upbeat',
      };
      const prompts = gen.buildWeightedPrompts(direction);
      expect(prompts).toHaveLength(1);
      expect(prompts[0].weight).toBe(1.0);
      expect(prompts[0].text).toContain('chiptune music');
      expect(prompts[0].text).toContain('upbeat mood');
    });

    it('includes instruments when provided', () => {
      const direction: MusicDirection = {
        genre: 'orchestral',
        mood: 'mysterious',
        instruments: ['piano', 'strings', 'oboe'],
      };
      const prompts = gen.buildWeightedPrompts(direction);
      expect(prompts[0].text).toContain('featuring piano, strings, oboe');
    });

    it('includes notes when provided', () => {
      const direction: MusicDirection = {
        genre: 'synthwave',
        mood: 'intense',
        notes: 'retro 80s feel',
      };
      const prompts = gen.buildWeightedPrompts(direction);
      expect(prompts[0].text).toContain('retro 80s feel');
    });

    it('always includes "video game background music, loopable"', () => {
      const direction: MusicDirection = {
        genre: 'ambient',
        mood: 'peaceful',
      };
      const prompts = gen.buildWeightedPrompts(direction);
      expect(prompts[0].text).toContain('video game background music, loopable');
    });

    it('handles direction with all optional fields', () => {
      const direction: MusicDirection = {
        genre: 'lo-fi-hip-hop',
        mood: 'calm',
        tempo: 85,
        instruments: ['piano', 'vinyl crackle'],
        notes: 'study vibes',
      };
      const prompts = gen.buildWeightedPrompts(direction);
      expect(prompts[0].text).toContain('lo-fi-hip-hop music');
      expect(prompts[0].text).toContain('calm mood');
      expect(prompts[0].text).toContain('featuring piano, vinyl crackle');
      expect(prompts[0].text).toContain('study vibes');
    });
  });
});
