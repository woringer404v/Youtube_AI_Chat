// src/app/_components/citation-renderer.tsx
'use client';

import React from 'react';

interface CitationRendererProps {
  text: string;
  videos: Record<string, { youtubeId: string; title: string }>;
}

export function CitationRenderer({ text, videos }: CitationRendererProps) {
  // 👇 FINAL, FINAL Regex: Matches "[video_id: ID_VALUE, time: TIMESTAMP_VALUE]"
  // Captures the ID_VALUE (group 1) and the TIMESTAMP_VALUE (group 2)
  const citationRegex = /\[video_id:\s*([\w-]+),\s*time:\s*(\d+(?:\.\d*)?)s?\]/g;

  const elements: Array<{ key: string; element: React.ReactNode }> = [];
  let lastIndex = 0;
  let citationCounter = 1; // Start citation numbering at 1
  let elementCounter = 0; // Unique counter for all elements

  // Use matchAll to find all citation blocks
  for (const match of text.matchAll(citationRegex)) {
    const fullMatch = match[0]; // The entire citation block
    const videoId = match[1]; // The captured video ID value
    const timestamp = parseFloat(match[2] || '0'); // The captured timestamp value
    const matchIndex = match.index ?? 0;

    // Add the text segment before the current citation
    if (matchIndex > lastIndex) {
      elements.push({
        key: `text-${elementCounter++}`,
        element: text.substring(lastIndex, matchIndex)
      });
    }

    const videoInfo = videos[videoId]; // Look up video info

    if (videoInfo) {
      const youtubeLink = `https://www.youtube.com/watch?v=${videoInfo.youtubeId}&t=${Math.floor(timestamp)}s`;
      const currentCitationNumber = citationCounter++; // Use and increment counter

      elements.push({
        key: `citation-${elementCounter++}`,
        element: (
          <a
            href={youtubeLink}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 inline-block rounded bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:hover:bg-blue-800"
            title={`Go to "${videoInfo.title}" at ${timestamp.toFixed(1)}s`}
          >
            [{currentCitationNumber}] {/* Display clean citation number */}
          </a>
        )
      });
    } else {
      // Fallback: If video info not found, render the original citation text
      elements.push({
        key: `fallback-${elementCounter++}`,
        element: fullMatch
      });
    }

    // Update lastIndex to the end of the current citation block
    lastIndex = matchIndex + fullMatch.length;
  }

  // Add any remaining text after the last citation block
  if (lastIndex < text.length) {
    elements.push({
      key: `text-${elementCounter++}`,
      element: text.substring(lastIndex)
    });
  }

  // Render all collected elements with proper keys
  return <>{elements.map(({ key, element }) => <React.Fragment key={key}>{element}</React.Fragment>)}</>;
}