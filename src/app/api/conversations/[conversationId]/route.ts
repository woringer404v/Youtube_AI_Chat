// src/app/api/conversations/[conversationId]/route.ts
import { createClient } from '@/lib/supabase/server';
import { NextRequest } from 'next/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const supabase = await createClient();

    // Authenticate the user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Get user's profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("userId", user.id)
      .single();

    if (!profile) {
      return new Response("User profile not found", { status: 404 });
    }

    // Fetch the conversation and verify ownership
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, title, profileId, created_at')
      .eq('id', conversationId)
      .eq('profileId', profile.id)
      .single();

    if (convError || !conversation) {
      return new Response("Conversation not found", { status: 404 });
    }

    // Fetch messages for this conversation
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('id, role, content, created_at')
      .eq('conversationId', conversationId)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return new Response("Error fetching messages", { status: 500 });
    }

    // Fetch linked videos for this conversation
    const { data: videoLinks, error: videoLinksError } = await supabase
      .from('_ConversationToVideo')
      .select('B')
      .eq('A', conversationId);

    if (videoLinksError) {
      console.error('Error fetching video links:', videoLinksError);
      return new Response("Error fetching video links", { status: 500 });
    }

    const videoIds = videoLinks?.map((link) => link.B) || [];

    // Fetch video details
    let videos: Array<{
      id: string;
      youtubeId: string;
      title: string;
      thumbnailUrl: string;
      status: string;
    }> = [];
    if (videoIds.length > 0) {
      const { data: videosData, error: videosError } = await supabase
        .from('videos')
        .select('id, youtube_id, title, thumbnail_url, status')
        .in('id', videoIds);

      if (videosError) {
        console.error('Error fetching videos:', videosError);
      } else {
        videos = (videosData || []).map((video: any) => ({
          id: video.id,
          youtubeId: video.youtube_id,
          title: video.title,
          thumbnailUrl: video.thumbnail_url,
          status: video.status,
        }));
      }
    }

    return Response.json({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        createdAt: conversation.created_at,
      },
      messages: messages || [],
      videos,
      videoIds,
    });

  } catch (error: any) {
    console.error('Error fetching conversation:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const supabase = await createClient();

    // Authenticate the user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Get user's profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("userId", user.id)
      .single();

    if (!profile) {
      return new Response("User profile not found", { status: 404 });
    }

    // Parse request body
    const body = await req.json();
    const { title } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return new Response("Invalid title", { status: 400 });
    }

    // Update the conversation title (verify ownership)
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ title: title.trim() })
      .eq('id', conversationId)
      .eq('profileId', profile.id);

    if (updateError) {
      console.error('Error updating conversation:', updateError);
      return new Response("Failed to update conversation", { status: 500 });
    }

    return Response.json({ success: true });

  } catch (error: any) {
    console.error('Error updating conversation:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const supabase = await createClient();

    // Authenticate the user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Get user's profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("userId", user.id)
      .single();

    if (!profile) {
      return new Response("User profile not found", { status: 404 });
    }

    // Delete messages first (foreign key constraint)
    const { error: messagesError } = await supabase
      .from('messages')
      .delete()
      .eq('conversationId', conversationId);

    if (messagesError) {
      console.error('Error deleting messages:', messagesError);
      return new Response("Failed to delete messages", { status: 500 });
    }

    // Delete video links
    const { error: linksError } = await supabase
      .from('_ConversationToVideo')
      .delete()
      .eq('A', conversationId);

    if (linksError) {
      console.error('Error deleting video links:', linksError);
      return new Response("Failed to delete video links", { status: 500 });
    }

    // Delete the conversation (verify ownership)
    const { error: deleteError } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId)
      .eq('profileId', profile.id);

    if (deleteError) {
      console.error('Error deleting conversation:', deleteError);
      return new Response("Failed to delete conversation", { status: 500 });
    }

    return Response.json({ success: true });

  } catch (error: any) {
    console.error('Error deleting conversation:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
