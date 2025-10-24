// src/app/_components/app-layout.tsx
import { createClient } from "@/lib/supabase/server";
import { Suspense } from 'react';
import { ClientLayout } from './client-layout';
import { ConversationHistory } from './conversation-history';
import { ConversationHistoryLoading } from './conversation-history-loading';

export default async function AppLayout() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch videos for the current user's profile
  // First, get the user's profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("userId", user!.id)
    .single();

  // Then fetch videos for that profile
  const { data: videosData, error } = await supabase
    .from("videos")
    .select("id, youtube_id, title, thumbnail_url, status, created_at, updated_at")
    .eq("profileId", profile?.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error('Error fetching videos:', error);
  }

  console.log('Fetched videos for profile:', profile?.id, videosData);

  // Fetch conversation count for metrics
  const { count: conversationCount } = await supabase
    .from("conversations")
    .select("*", { count: 'exact', head: true })
    .eq("profileId", profile?.id);

  // Map database fields (snake_case) to component props (camelCase)
  const videos = (videosData || []).map((video: any) => ({
    id: video.id,
    youtubeId: video.youtube_id,
    title: video.title,
    thumbnailUrl: video.thumbnail_url,
    status: video.status,
    createdAt: video.created_at,
    updatedAt: video.updated_at,
  }));

  const videoDetailsMap: Record<string, { youtubeId: string; title: string }> = {};
  videos.forEach(v => {
    videoDetailsMap[v.id] = { youtubeId: v.youtubeId, title: v.title };
  });

  // Calculate metrics
  const totalVideos = videos.length;
  const failedVideos = videos.filter(v => v.status === 'FAILED').length;

  // Get the most recent successfully ingested video (status === READY)
  // Sort by updated_at to get the most recently completed ingestion
  const readyVideos = videos
    .filter(v => v.status === 'READY')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const lastIngestion = readyVideos.length > 0 ? readyVideos[0].updatedAt : null;

  const metrics = {
    totalVideos,
    totalConversations: conversationCount || 0,
    lastIngestion,
    failedVideos,
  };

  // Pass the data to the Client Component
return (
    <ClientLayout videos={videos} videoDetailsMap={videoDetailsMap} metrics={metrics}>
      <Suspense fallback={<ConversationHistoryLoading />}>
        <ConversationHistory />
      </Suspense>
    </ClientLayout>
  );}
