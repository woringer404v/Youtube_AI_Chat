"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { inngest } from "@/app/api/inngest/route";
import { google } from 'googleapis';

// Helper to extract YouTube video ID
function extractVideoId(url: string): string | null {
  const youtubeIdRegex = /(?:v=|\/)([0-9A-Za-z_-]{11}).*/;
  const match = url.match(youtubeIdRegex);
  return match ? match[1] : null;
}

// Helper to extract YouTube channel ID or handle
function extractChannelInfo(url: string): { type: 'id' | 'handle' | null, value: string | null } {
  // Channel ID: UC... (24 characters starting with UC)
  const channelIdMatch = url.match(/\/channel\/(UC[0-9A-Za-z_-]{22})/);
  if (channelIdMatch) {
    return { type: 'id', value: channelIdMatch[1] };
  }

  // Channel handle: @username
  const handleMatch = url.match(/\/@([0-9A-Za-z_-]+)/);
  if (handleMatch) {
    return { type: 'handle', value: handleMatch[1] };
  }

  // User URL format: /user/username
  const userMatch = url.match(/\/user\/([0-9A-Za-z_-]+)/);
  if (userMatch) {
    return { type: 'handle', value: userMatch[1] };
  }

  // Custom URL: /c/customname
  const customMatch = url.match(/\/c\/([0-9A-Za-z_-]+)/);
  if (customMatch) {
    return { type: 'handle', value: customMatch[1] };
  }

  return { type: null, value: null };
}

// Get latest videos from a YouTube channel
async function getChannelVideos(channelInfo: { type: 'id' | 'handle', value: string }): Promise<string[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY environment variable is not set');
  }

  const youtube = google.youtube({ version: 'v3', auth: apiKey });

  try {
    let channelId: string;

    // If we have a handle, first resolve it to a channel ID
    if (channelInfo.type === 'handle') {
      const searchResponse = await youtube.search.list({
        part: ['snippet'],
        q: channelInfo.value,
        type: ['channel'],
        maxResults: 1,
      });

      const channelItem = searchResponse.data.items?.[0];
      if (!channelItem || !channelItem.snippet?.channelId) {
        throw new Error(`Could not find channel for handle: ${channelInfo.value}`);
      }
      channelId = channelItem.snippet.channelId;
    } else {
      channelId = channelInfo.value;
    }

    // Get the uploads playlist ID
    const channelResponse = await youtube.channels.list({
      part: ['contentDetails'],
      id: [channelId],
    });

    const uploadsPlaylistId = channelResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
      throw new Error('Could not find uploads playlist for this channel');
    }

    // Get the latest 10 videos from the uploads playlist
    const playlistResponse = await youtube.playlistItems.list({
      part: ['contentDetails'],
      playlistId: uploadsPlaylistId,
      maxResults: 10,
    });

    const videoIds = playlistResponse.data.items?.map(item => item.contentDetails?.videoId).filter(Boolean) as string[];

    if (!videoIds || videoIds.length === 0) {
      throw new Error('No videos found in this channel');
    }

    return videoIds;
  } catch (error: any) {
    console.error('Error fetching channel videos:', error);
    throw new Error(`Failed to fetch channel videos: ${error.message}`);
  }
}

export async function requestIngestion(_prevState: any, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { message: "Error: Not authenticated" };
  }

  const url = formData.get("url") as string;
  if (!url) {
    return { message: "Error: URL is required" };
  }

  // First, check if it's a channel URL
  const channelInfo = extractChannelInfo(url);

  // If it's a channel, handle batch ingestion
  if (channelInfo.type && channelInfo.value) {
    try {
      console.log(`📺 Detected channel URL, fetching latest videos...`);

      const videoIds = await getChannelVideos(channelInfo as { type: 'id' | 'handle', value: string });

      console.log(`✅ Found ${videoIds.length} videos from channel`);

      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("userId", user.id)
        .single();

      if (profileError || !profile) {
        throw new Error("Could not find user profile");
      }
      const profileId = profile.id;

      const cuid = require("cuid");
      let ingestedCount = 0;
      let skippedCount = 0;

      // Process each video
      for (const youtubeId of videoIds) {
        // Check if video already exists
        const { data: existingVideo } = await supabase
          .from("videos")
          .select("id")
          .eq("youtube_id", youtubeId)
          .eq("profileId", profileId)
          .single();

        if (existingVideo) {
          console.log(`⏭️ Skipping existing video: ${youtubeId}`);
          skippedCount++;
          continue;
        }

        const newId = cuid();

        // Insert the video
        const { data: newVideo, error } = await supabase
          .from("videos")
          .insert({
            id: newId,
            youtube_id: youtubeId,
            title: "Fetching title...",
            thumbnail_url: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
            profileId: profileId,
            status: "QUEUED",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select("id, youtube_id")
          .single();

        if (error) {
          console.error(`Failed to insert video ${youtubeId}:`, error);
          continue;
        }

        // Send ingestion event
        await inngest.send({
          name: "youtube/ingest",
          data: {
            videoId: newVideo.id,
            youtubeId: newVideo.youtube_id,
          },
        });

        ingestedCount++;
      }

      revalidatePath("/");

      if (ingestedCount === 0 && skippedCount > 0) {
        return { message: `Success: All ${skippedCount} videos already in your library!` };
      }

      return {
        message: `Success: Queued ${ingestedCount} videos from channel for ingestion!${skippedCount > 0 ? ` (${skippedCount} already existed)` : ''}`
      };

    } catch (error: any) {
      console.error("Channel ingestion error:", error);
      return { message: `Error: ${error.message}` };
    }
  }

  // Otherwise, treat as single video URL
  const youtubeId = extractVideoId(url);

  if (!youtubeId) {
    return { message: "Error: Invalid YouTube URL. Please provide a video or channel URL." };
  }

try {
    // Step 1: Look up the user's profile using their auth ID.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("userId", user.id) // Match against the userId column
      .single();

    if (profileError || !profile) {
      throw new Error("Could not find user profile. Please sign up again.");
    }
    const profileId = profile.id; // This is the correct ID to use

    const cuid = require("cuid");
    const newId = cuid();

    // Step 2: Insert the video with the fetched profileId.
    const { data: newVideo, error } = await supabase
      .from("videos")
      .insert({
        id: newId,
        youtube_id: youtubeId,
        title: "Fetching title...",
        thumbnail_url: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
        profileId: profileId, // 👈 Use the correct, verified profile ID
        status: "QUEUED",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id, youtube_id")
      .single();

    if (error) throw error;
    if (!newVideo) throw new Error("Failed to insert video.");

    // Step 3: Send the event to Inngest.
    await inngest.send({
      name: "youtube/ingest",
      data: {
        videoId: newVideo.id,
        youtubeId: newVideo.youtube_id,
      },
    });

  } catch (error: any) {
    console.error("Ingestion request error:", error);

    // Handle duplicate video error with user-friendly message
    if (error.code === '23505' && error.message?.includes('videos_youtube_id_key')) {
      return { message: "Error: This video is already in your library!" };
    }

    return { message: `Error: ${error.message}` };
  }

  revalidatePath("/"); // Refresh the data on the page
  return { message: "Success: Video is now queued for ingestion!" };
}

export async function retryFailedVideo(videoId: string) {
  "use server";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: "Error: Not authenticated" };
  }

  try {
    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("userId", user.id)
      .single();

    if (profileError || !profile) {
      throw new Error("Could not find user profile");
    }

    // Get the failed video
    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("id, youtube_id, status")
      .eq("id", videoId)
      .eq("profileId", profile.id)
      .single();

    if (videoError || !video) {
      throw new Error("Video not found");
    }

    if (video.status !== "FAILED") {
      throw new Error("Video is not in FAILED status");
    }

    // Reset status to QUEUED and clear failure reason
    const { error: updateError } = await supabase
      .from("videos")
      .update({
        status: "QUEUED",
        failure_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", videoId);

    if (updateError) {
      throw new Error("Failed to update video status");
    }

    // Send the event to Inngest to retry ingestion
    await inngest.send({
      name: "youtube/ingest",
      data: {
        videoId: video.id,
        youtubeId: video.youtube_id,
      },
    });

    revalidatePath("/");
    return { success: true, message: "Success: Video retry initiated!" };

  } catch (error: any) {
    console.error("Retry video error:", error);
    return { success: false, message: `Error: ${error.message}` };
  }
}