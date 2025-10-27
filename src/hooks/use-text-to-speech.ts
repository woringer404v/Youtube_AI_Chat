// src/hooks/use-text-to-speech.ts
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface UseTextToSpeechOptions {
  rate?: number; // 0.1 to 10
  pitch?: number; // 0 to 2
  volume?: number; // 0 to 1
  lang?: string;
}

interface UseTextToSpeechReturn {
  speak: (text: string) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  isSpeaking: boolean;
  isPaused: boolean;
  isSupported: boolean;
}

export function useTextToSpeech(
  options: UseTextToSpeechOptions = {}
): UseTextToSpeechReturn {
  const {
    rate = 1,
    pitch = 1,
    volume = 1,
    lang = 'en-US',
  } = options;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  const chunksRef = useRef<string[]>([]);
  const currentIndexRef = useRef(0);
  const isCancelledRef = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      setIsSupported(true);
    }

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Function to split text into smaller chunks (by sentences)
  const chunkText = (text: string): string[] => {
    // Remove citation markers in format [video_id: xxx, time: yyy] and [1], [2], etc.
    let cleanText = text
      .replace(/\[video_id:\s*[\w-]+,\s*time:\s*\d+(?:\.\d*)?s?.*?\]/g, '')
      .replace(/\[\d+\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // If text is empty after cleaning, return empty array
    if (!cleanText) return [];

    // Split by sentences (., !, ?) while keeping the punctuation
    const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];

    // Combine sentences into chunks of ~200 characters max
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length < 200) {
        currentChunk += ' ' + sentence;
      } else {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      }
    }
    if (currentChunk) chunks.push(currentChunk.trim());

    return chunks;
  };

  const speakChunk = useCallback(
    (chunk: string, isFirst: boolean, isLast: boolean) => {
      return new Promise<void>((resolve, reject) => {
        if (isCancelledRef.current) {
          reject(new Error('Cancelled'));
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.rate = rate;
        utterance.pitch = pitch;
        utterance.volume = volume;
        utterance.lang = lang;

        // Try to select a better quality voice
        const voices = window.speechSynthesis.getVoices();

        // Log available voices for debugging
        if (isFirst) {
          console.log('Available voices:', voices.map(v => `${v.name} (${v.lang})`));
        }

        // Prefer Google English voices (high quality) or natural-sounding voices
        // Priority order: Google US English > Google UK Female > Google UK Male > others
        const preferredVoice =
          voices.find(voice => voice.name === 'Google US English') ||
          voices.find(voice => voice.name === 'Google UK English Female') ||
          voices.find(voice => voice.name === 'Google UK English Male') ||
          voices.find(voice => voice.name.includes('Samantha')) ||
          voices.find(voice => voice.name.includes('Alex')) ||
          voices.find(voice => voice.lang.startsWith('en') && voice.name.includes('Natural')) ||
          voices.find(voice => voice.lang.startsWith('en'));

        if (preferredVoice) {
          utterance.voice = preferredVoice;
          if (isFirst) {
            console.log('Selected voice:', preferredVoice.name);
          }
        } else if (isFirst) {
          console.log('Using default voice (no preferred voice found)');
        }

        utterance.onstart = () => {
          if (isFirst) {
            setIsSpeaking(true);
            setIsPaused(false);
          }
        };

        utterance.onend = () => {
          if (isLast) {
            setIsSpeaking(false);
            setIsPaused(false);
          }
          resolve();
        };

        utterance.onerror = (event) => {
          // Ignore 'interrupted' and 'canceled' errors as they're expected
          if (event.error !== 'interrupted' && event.error !== 'canceled') {
            console.error('Speech synthesis error:', event.error);
          }
          if (isLast) {
            setIsSpeaking(false);
            setIsPaused(false);
          }
          reject(event);
        };

        window.speechSynthesis.speak(utterance);
      });
    },
    [rate, pitch, volume, lang]
  );

  const speakChunks = useCallback(
    async (chunks: string[]) => {
      isCancelledRef.current = false;

      for (let i = 0; i < chunks.length; i++) {
        if (isCancelledRef.current) break;

        currentIndexRef.current = i;
        const isFirst = i === 0;
        const isLast = i === chunks.length - 1;

        try {
          await speakChunk(chunks[i], isFirst, isLast);
        } catch (error) {
          // If cancelled or interrupted, stop the loop
          break;
        }
      }
    },
    [speakChunk]
  );

  const speak = useCallback(
    (text: string) => {
      if (!isSupported) return;

      // Cancel any ongoing speech
      isCancelledRef.current = true;
      window.speechSynthesis.cancel();

      // Small delay to ensure cancellation is processed
      setTimeout(() => {
        const chunks = chunkText(text);
        chunksRef.current = chunks;
        currentIndexRef.current = 0;
        speakChunks(chunks);
      }, 100);
    },
    [isSupported, speakChunks]
  );

  const stop = useCallback(() => {
    isCancelledRef.current = true;
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setIsPaused(false);
    }
  }, []);

  const pause = useCallback(() => {
    if (window.speechSynthesis && isSpeaking && !isPaused) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, [isSpeaking, isPaused]);

  const resume = useCallback(() => {
    if (window.speechSynthesis && isSpeaking && isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  }, [isSpeaking, isPaused]);

  return {
    speak,
    stop,
    pause,
    resume,
    isSpeaking,
    isPaused,
    isSupported,
  };
}
