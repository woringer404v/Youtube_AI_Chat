// src/app/chat/[conversationId]/page.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ClientLayout } from "@/app/_components/client-layout";
import { ConversationHistory } from "@/app/_components/conversation-history";
import { ConversationView } from "./_components/conversation-view";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  // Fetch user's profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("userId", user.id)
    .single();

  // Fetch all videos for the user (for the knowledge base explorer)
  const { data: videosData, error } = await supabase
    .from("videos")
    .select("id, youtube_id, title, thumbnail_url, status, created_at, updated_at")
    .eq("profileId", profile?.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching videos:", error);
  }

  // Fetch conversation count for metrics
  const { count: conversationCount } = await supabase
    .from("conversations")
    .select("*", { count: 'exact', head: true })
    .eq("profileId", profile?.id);

  const videos = (videosData || []).map((video: {
    id: string;
    youtube_id: string;
    title: string;
    thumbnail_url: string;
    status: 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';
    created_at: string;
    updated_at: string;
  }) => ({
    id: video.id,
    youtubeId: video.youtube_id,
    title: video.title,
    thumbnailUrl: video.thumbnail_url,
    status: video.status,
    createdAt: video.created_at,
    updatedAt: video.updated_at,
  }));

  const videoDetailsMap: Record<string, { youtubeId: string; title: string }> = {};
  videos.forEach((v) => {
    videoDetailsMap[v.id] = { youtubeId: v.youtubeId, title: v.title };
  });

  // Fetch the specific conversation with messages
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("id, title, created_at")
    .eq("id", conversationId)
    .eq("profileId", profile?.id)
    .single();

  if (convError || !conversation) {
    console.error("Conversation not found:", convError);
    return redirect("/");
  }

  // Fetch messages
  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversationId", conversationId)
    .order("created_at", { ascending: true });

  // Fetch linked videos
  const { data: videoLinks } = await supabase
    .from("_ConversationToVideo")
    .select("B")
    .eq("A", conversationId);

  const linkedVideoIds = videoLinks?.map((link) => link.B) || [];

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

  return (
    <ClientLayout
      key={conversationId}
      videos={videos}
      videoDetailsMap={videoDetailsMap}
      metrics={metrics}
      chatView={
        <ConversationView
          conversationId={conversationId}
          initialMessages={messages || []}
          initialVideoIds={linkedVideoIds}
          videoDetailsMap={videoDetailsMap}
        />
      }
    >
      <ConversationHistory />
    </ClientLayout>
  );
}
