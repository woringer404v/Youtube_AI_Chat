// src/app/_components/knowledge-base-explorer.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Toaster, toast } from 'sonner';
import { requestIngestion, retryFailedVideo } from '@/app/actions';
import Image from 'next/image';
import { useScope } from '../_context/scope-context';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { RotateCw, Video as VideoIcon, MessageSquare, Clock, AlertCircle } from 'lucide-react';
import type { Metrics } from './client-layout';

// Define the type for our video object
type Video = {
  id: string;
  youtubeId: string;
  title: string;
  thumbnailUrl: string;
  status: 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';
};

const initialState = { message: '' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>Add</Button>;
}

// Pass the videos as a prop
export function KnowledgeBaseExplorer({ videos: initialVideos, metrics }: { videos: Video[]; metrics: Metrics }) {
  const [state, formAction] = useActionState(requestIngestion, initialState);
  const { setScopedVideos, setScopeMode } = useScope();
  const router = useRouter();
  const [videos, setVideos] = useState<Video[]>(initialVideos);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(initialVideos.length === 0);
  const [selectedVideos, setSelectedVideos] = useState<string[]>([]);

  // Set up real-time subscription for video updates
  useEffect(() => {
    const supabase = createClient();
    let refreshTimeout: NodeJS.Timeout | null = null;

    console.log('🔌 Setting up real-time subscription for videos table...');

    // Subscribe to changes in the videos table
    const channel = supabase
      .channel('videos-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'videos',
        },
        (payload) => {
          console.log('🔄 Video change detected:', payload.eventType);

          // Debounce refresh to avoid multiple rapid calls
          if (refreshTimeout) {
            clearTimeout(refreshTimeout);
          }
          refreshTimeout = setTimeout(() => {
            console.log('Refreshing page to fetch latest data...');
            router.refresh();
          }, 1000); // Wait 1 second before refreshing
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
      });

    return () => {
      console.log('🔌 Cleaning up real-time subscription');
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      supabase.removeChannel(channel);
    };
  }, [router]);

  // Update local state when initialVideos prop changes
  useEffect(() => {
    setVideos(initialVideos);
    if (initialVideos.length > 0) {
      setIsLoading(false);
    }
  }, [initialVideos]);

  // Fallback: Poll for updates every 10 seconds if we have PROCESSING videos
  // (Real-time subscription should handle most updates, this is just a backup)
  useEffect(() => {
    const hasProcessingVideos = videos.some(v => v.status === 'PROCESSING' || v.status === 'QUEUED');

    if (!hasProcessingVideos) return;

    console.log('⏱️ Starting polling for video status updates...');
    const interval = setInterval(() => {
      console.log('🔄 Polling for updates...');
      router.refresh();
    }, 10000); // Poll every 10 seconds (reduced from 5)

    return () => {
      console.log('⏱️ Stopping polling');
      clearInterval(interval);
    };
  }, [videos, router]);

  useEffect(() => {
    if (state.message.startsWith('Success:')) {
      toast.success(state.message);
    } else if (state.message.startsWith('Error:')) {
      toast.error(state.message);
    }
  }, [state]);

  // Handle checkbox changes for temporary selection
  const handleVideoSelection = (videoId: string) => {
    const newSelectedVideos = selectedVideos.includes(videoId)
      ? selectedVideos.filter((id) => id !== videoId) // Uncheck: remove ID
      : [...selectedVideos, videoId]; // Check: add ID

    console.log('✅ Video selection changed:', {
      videoId,
      previouslySelected: selectedVideos,
      nowSelected: newSelectedVideos
    });

    setSelectedVideos(newSelectedVideos);
  };

  // Use selected videos as context
  const handleUseAsContext = () => {
    setScopeMode('subset');
    setScopedVideos(selectedVideos);
    toast.success(`${selectedVideos.length} video(s) set as context`);
  };

  // Clear selection
  const handleClearSelection = () => {
    setSelectedVideos([]);
  };

  // Filter videos based on search query
  const filteredVideos = videos.filter(video =>
    video.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle retry for failed videos
  const handleRetry = async (videoId: string) => {
    const result = await retryFailedVideo(videoId);
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };

  // Format last ingestion time
  const formatLastIngestion = (timestamp: string | null) => {
    if (!timestamp) return 'Never';

    // Parse timestamp - handle both ISO strings and ensure UTC interpretation
    const date = new Date(timestamp);
    const now = new Date();

    // Calculate difference in milliseconds
    const diffMs = now.getTime() - date.getTime();

    // If difference is negative or very small, something is wrong
    if (diffMs < 0) return date.toLocaleDateString();

    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <Toaster richColors />

      {/* Mini Metrics */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 rounded-lg border bg-card p-3">
          <VideoIcon className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Videos</p>
            <p className="text-lg font-semibold">{metrics.totalVideos}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card p-3">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Conversations</p>
            <p className="text-lg font-semibold">{metrics.totalConversations}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card p-3">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Last Ingestion</p>
            <p className="text-sm font-medium">{formatLastIngestion(metrics.lastIngestion)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card p-3">
          <AlertCircle className={`h-4 w-4 ${metrics.failedVideos > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
          <div>
            <p className="text-xs text-muted-foreground">Failed</p>
            <p className={`text-lg font-semibold ${metrics.failedVideos > 0 ? 'text-destructive' : ''}`}>
              {metrics.failedVideos}
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add to Knowledge Base</CardTitle>
          <CardDescription>Add a YouTube video or channel to start.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-2">
            <Label htmlFor="youtube-url">YouTube URL</Label>
            <div className="flex gap-2">
              <Input
                id="youtube-url"
                name="url"
                placeholder="Video: youtube.com/watch?v=... or Channel: youtube.com/@username"
                required
              />
              <SubmitButton />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              💡 Paste a channel URL to automatically ingest the latest 10 videos
            </p>
          </form>
        </CardContent>
      </Card>

      <div className="flex-1 overflow-y-auto">
        <div className="mb-4 space-y-2">
          <h2 className="text-lg font-semibold tracking-tight">My Videos</h2>

          {/* Toolbar - appears when videos are selected */}
          {selectedVideos.length > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted p-2">
              <span className="text-sm font-medium">
                {selectedVideos.length} selected
              </span>
              <div className="flex gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleUseAsContext}
                >
                  Use as Context
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearSelection}
                >
                  Clear Selection
                </Button>
              </div>
            </div>
          )}

          <Input
            type="search"
            placeholder="Search videos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="space-y-2">
          {isLoading ? (
            // Loading skeletons
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border p-2">
                <Skeleton className="h-5 w-5 rounded" />
                <div className="flex flex-1 items-center gap-4">
                  <Skeleton className="h-[75px] w-[100px] rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </div>
            ))
          ) : filteredVideos.length > 0 ? (
            filteredVideos.map((video) => (
              // NEW: Add conditional styling based on checkbox state
              <div
                key={video.id}
                className="flex items-center gap-2 rounded-lg border p-2 has-[[data-state=checked]]:bg-slate-200 dark:has-[[data-state=checked]]:bg-slate-800"
              >
                {/* Checkbox for video selection */}
                <Checkbox
                  id={`video-${video.id}`}
                  checked={selectedVideos.includes(video.id)}
                  onCheckedChange={() => handleVideoSelection(video.id)}
                  disabled={video.status !== 'READY'} // Only allow selecting ready videos
                  aria-label={`Select ${video.title}`}
                />
                <Label htmlFor={`video-${video.id}`} className="flex flex-1 cursor-pointer items-center gap-4">
                  {video.thumbnailUrl ? (
                    <Image
                      src={video.thumbnailUrl}
                      alt={video.title}
                      width={100}
                      height={75}
                      className="rounded-md object-cover"
                    />
                  ) : (
                    <div className="w-[100px] h-[75px] rounded-md bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                      <span className="text-xs text-muted-foreground">No thumbnail</span>
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="font-semibold text-sm line-clamp-2">{video.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Status: <span className={`font-medium ${video.status === 'FAILED' ? 'text-destructive' : ''}`}>{video.status}</span>
                    </p>
                  </div>
                </Label>

                {/* Retry button for failed videos */}
                {video.status === 'FAILED' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      handleRetry(video.id);
                    }}
                    className="ml-auto"
                  >
                    <RotateCw className="h-4 w-4 mr-1" />
                    Retry
                  </Button>
                )}
              </div>
            ))
          ) : videos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your ingested videos will appear here.</p>
          ) : (
            <p className="text-sm text-muted-foreground">No videos match your search.</p>
          )}
        </div>
      </div>
    </div>
  );
}