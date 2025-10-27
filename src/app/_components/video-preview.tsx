// src/app/_components/video-preview.tsx
'use client';

import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VideoPreviewProps {
  youtubeId: string;
  timestamp: number;
  title: string;
  onClose: () => void;
}

export function VideoPreview({ youtubeId, timestamp, title, onClose }: VideoPreviewProps) {
  const embedUrl = `https://www.youtube.com/embed/${youtubeId}?start=${Math.floor(timestamp)}&autoplay=1`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-4xl mx-4 bg-background rounded-lg shadow-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-lg truncate">{title}</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 rounded-full"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Video Player */}
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <iframe
            className="absolute top-0 left-0 w-full h-full"
            src={embedUrl}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-muted/30">
          <p className="text-sm text-muted-foreground">
            Starting at {Math.floor(timestamp / 60)}:{String(Math.floor(timestamp % 60)).padStart(2, '0')}
          </p>
        </div>
      </div>
    </div>
  );
}
