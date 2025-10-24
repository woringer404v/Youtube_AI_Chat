// src/app/api/inngest/route.ts
import { serve } from "inngest/next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import ZeroEntropy from "zeroentropy";
import { Innertube } from "youtubei.js";
import { inngest } from "@/lib/inngest/client";

// Initialize ZeroEntropy client
function getZeroEntropyClient(): ZeroEntropy {
  const apiKey = process.env.ZERO_ENTROPY_API_KEY;
  if (!apiKey) {
    throw new Error('ZERO_ENTROPY_API_KEY environment variable is not set');
  }
  return new ZeroEntropy({ apiKey });
}

// YouTube transcript fetcher using youtubei.js
interface TranscriptSegment {
  text: string;
  offset: number;
  duration: number;
}

interface YouTubeVideoData {
  transcript: TranscriptSegment[];
  title: string;
  thumbnailUrl: string;
}

async function fetchYouTubeTranscript(videoId: string): Promise<YouTubeVideoData> {
  try {
    console.log(`[1/4] Starting transcript fetch for video: ${videoId}`);

    // Initialize YouTube client with timeout
    console.log('[2/4] Initializing YouTube client...');
    const youtube = await Promise.race([
      Innertube.create(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('YouTube client initialization timeout')), 30000)
      )
    ]);
    console.log('[2/4] YouTube client initialized successfully');

    // Get video info
    console.log('[3/4] Fetching video info...');
    const videoInfo = await Promise.race([
      youtube.getInfo(videoId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Video info fetch timeout')), 30000)
      )
    ]);
    console.log('[3/4] Video info fetched successfully');

    // Extract video metadata
    const title = videoInfo.basic_info?.title || 'Unknown Title';
    const thumbnailUrl = videoInfo.basic_info?.thumbnail?.[0]?.url || '';
    console.log(`   Video title: ${title}`);
    console.log(`   Thumbnail URL: ${thumbnailUrl}`);

    // Get transcript
    console.log('[4/4] Fetching transcript data...');
    const transcriptData = await Promise.race([
      videoInfo.getTranscript(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Transcript fetch timeout')), 30000)
      )
    ]);
    console.log('[4/4] Transcript data fetched successfully');

    if (!transcriptData || !transcriptData.transcript) {
      throw new Error('No transcript available for this video');
    }

    const transcript = transcriptData.transcript;

    // Extract segments - body can be either an array or a single TranscriptSegmentList object
    const segments: TranscriptSegment[] = [];
    const body = transcript.content?.body;

    // Helper function to process a TranscriptSegmentList
    const processSegmentList = (segmentList: { initial_segments?: Array<{ type?: string; snippet?: { text?: string }; start_ms?: string | number; end_ms?: string | number }> }) => {
      if (segmentList.initial_segments && Array.isArray(segmentList.initial_segments)) {
        for (const segment of segmentList.initial_segments) {
          // Only process TranscriptSegment types (skip TranscriptSectionHeader)
          if (segment.type === 'TranscriptSegment' && segment.snippet?.text) {
            const startMs = typeof segment.start_ms === 'string'
              ? parseInt(segment.start_ms, 10)
              : (typeof segment.start_ms === 'number' ? segment.start_ms : 0);
            const endMs = typeof segment.end_ms === 'string'
              ? parseInt(segment.end_ms, 10)
              : (typeof segment.end_ms === 'number' ? segment.end_ms : startMs);

            segments.push({
              text: segment.snippet.text,
              offset: startMs,
              duration: endMs - startMs
            });
          }
        }
      }
    };

    // Check if body is an array or a single object
    if (body) {
      if (Array.isArray(body)) {
        // Body is an array - iterate through items
        for (const item of body) {
          if (item.type === 'TranscriptSegmentList') {
            processSegmentList(item);
          }
        }
      } else if (body.type === 'TranscriptSegmentList') {
        // Body is a single TranscriptSegmentList object
        processSegmentList(body);
      }
    }

    if (segments.length === 0) {
      console.error('Failed to extract segments. Body structure:', JSON.stringify(body, null, 2).substring(0, 1000));
      throw new Error('No valid transcript segments extracted');
    }

    console.log(`✅ Successfully extracted ${segments.length} transcript segments`);

    return {
      transcript: segments,
      title,
      thumbnailUrl
    };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Error fetching YouTube transcript for ${videoId}:`, error);
    throw new Error(`Failed to fetch transcript: ${errorMessage}`);
  }
}

// Helper function to get collection name for a video
function getCollectionName(videoId: string): string {
  return `video-${videoId}`;
}

// Helper function to chunk transcript into semantic paragraphs
interface ChunkedParagraph {
  text: string;
  startTime: number;
  endTime: number;
  path: string;
}

function chunkTranscript(
  transcript: TranscriptSegment[],
  videoId: string,
  chunkSize: number = 10 // Increased from 5 to 10 segments per chunk for better context
): ChunkedParagraph[] {
  const chunks: ChunkedParagraph[] = [];

  console.log(`   Chunking ${transcript.length} segments with chunk size ${chunkSize}`);

  // Calculate total text length for verification
  const totalText = transcript.map(seg => seg.text).join(' ');
  console.log(`   Total transcript length: ${totalText.length} characters`);

  for (let i = 0; i < transcript.length; i += chunkSize) {
    const segmentGroup = transcript.slice(i, i + chunkSize);

    // Combine text from multiple segments into a paragraph
    const text = segmentGroup.map(seg => seg.text).join(' ');

    // Get timing information
    const startTime = segmentGroup[0].offset / 1000; // Convert to seconds
    const lastSegment = segmentGroup[segmentGroup.length - 1];
    const endTime = (lastSegment.offset + lastSegment.duration) / 1000;

    // Create a unique path for this chunk (can be used for retrieval)
    const path = `${videoId}/chunk_${i}_${startTime.toFixed(1)}s.txt`;

    chunks.push({
      text,
      startTime,
      endTime,
      path,
    });
  }

  // Verify we're using all segments
  const totalChunkedText = chunks.map(c => c.text).join(' ');
  console.log(`   Created ${chunks.length} chunks`);
  console.log(`   Total chunked text length: ${totalChunkedText.length} characters`);
  console.log(`   Coverage: ${((totalChunkedText.length / totalText.length) * 100).toFixed(1)}%`);

  return chunks;
}

const ingestVideo = inngest.createFunction(
  { id: "ingest-youtube-video" },
  { event: "youtube/ingest" },
  async ({ event, step }) => {
    const { videoId, youtubeId } = event.data;
    // Use service role client for background jobs (bypasses RLS)
    const supabase = createServiceRoleClient();

    await step.run("update-status-to-processing", async () => {
      await supabase
        .from("videos")
        .update({ status: "PROCESSING", updated_at: new Date().toISOString() })
        .eq("id", videoId);
    });

    try {
      console.log(`🚀 Starting video ingestion for videoId=${videoId}, youtubeId=${youtubeId}`);

      const videoData = await step.run("fetch-transcript", async () => {
        console.log(`📝 Step: fetch-transcript started for YouTube ID: ${youtubeId}`);

        const videoData = await fetchYouTubeTranscript(youtubeId);

        // Log full transcript for verification
        const fullTranscriptText = videoData.transcript.map(seg => seg.text).join(' ');
        console.log(`\n========== FULL TRANSCRIPT START ==========`);
        console.log(fullTranscriptText);
        console.log(`========== FULL TRANSCRIPT END ==========\n`);

        console.log(`✅ Transcript fetched successfully:`, {
          title: videoData.title,
          segmentCount: videoData.transcript.length,
          totalCharacters: fullTranscriptText.length,
          firstSegment: videoData.transcript[0],
          lastSegment: videoData.transcript[videoData.transcript.length - 1],
          sampleData: videoData.transcript.slice(0, 3)
        });

        return videoData;
      });

      const transcript = videoData.transcript;
      const videoTitle = videoData.title;
      const thumbnailUrl = videoData.thumbnailUrl;

    // Chunk the transcript into semantic paragraphs
    const chunks = await step.run("chunk-transcript", async () => {
      console.log(`📦 Step: chunk-transcript started (${transcript.length} segments to chunk)`);

      if (!transcript || transcript.length === 0) {
        throw new Error('Cannot chunk empty transcript');
      }

      const chunks = chunkTranscript(transcript, videoId);
      console.log(`✅ Chunked transcript into ${chunks.length} paragraphs`);

      if (chunks.length === 0) {
        throw new Error('Chunking produced no results');
      }

      return chunks;
    });

    // Create ZeroEntropy collection for this video
    await step.run("create-zeroentropy-collection", async () => {
      console.log(`🗂️ Step: create-zeroentropy-collection started`);
      const client = getZeroEntropyClient();
      const collectionName = getCollectionName(videoId);

      try {
        await client.collections.add({ collection_name: collectionName });
        console.log(`✅ Created ZeroEntropy collection: ${collectionName}`);
      } catch (error: unknown) {
        // Collection might already exist, which is fine
        const errorMessage = error instanceof Error ? error.message : '';
        if (!errorMessage.includes('already exists')) {
          throw error;
        }
        console.log(`ℹ️ Collection ${collectionName} already exists`);
      }
    });

    // Embed each chunk into ZeroEntropy (creates semantic index)
    await step.run("embed-chunks", async () => {
      console.log(`🔮 Step: embed-chunks started (${chunks.length} chunks to embed)`);
      const client = getZeroEntropyClient();
      const collectionName = getCollectionName(videoId);

      // Add each chunk as a document with metadata
      let embeddedCount = 0;
      for (const chunk of chunks) {
        try {
          await client.documents.add({
            collection_name: collectionName,
            content: { type: 'text', text: chunk.text },
            path: chunk.path,
            metadata: {
              video_id: videoId,
              youtube_id: youtubeId,
              start_time: chunk.startTime.toString(),
              end_time: chunk.endTime.toString(),
              timestamp_link: `https://youtube.com/watch?v=${youtubeId}&t=${Math.floor(chunk.startTime)}s`,
            },
          });

          embeddedCount++;
          if (embeddedCount % 10 === 0) {
            console.log(`   Progress: ${embeddedCount}/${chunks.length} chunks embedded`);
          }
        } catch (error: unknown) {
          // If document already exists, skip it
          const errorMessage = error instanceof Error ? error.message : '';
          const errorStatus = error && typeof error === 'object' && 'status' in error ? (error as { status: number }).status : 0;
          if (errorMessage.includes('already exists') || errorStatus === 409) {
            console.log(`   ⏭️ Skipping existing chunk: ${chunk.path}`);
            embeddedCount++;
          } else {
            throw error;
          }
        }
      }

      console.log(`✅ Successfully embedded all ${chunks.length} chunks`);
    });

    // Update video status to READY with title and thumbnail

    await step.run("update-video-details", async () => {
      console.log(`📝 Updating video details:`, {
        videoId,
        title: videoTitle,
        thumbnailUrl,
      });

      const { data, error } = await supabase
        .from("videos")
        .update({
          status: "READY",
          title: videoTitle,
          thumbnail_url: thumbnailUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", videoId)
        .select();

      if (error) {
        console.error('❌ Error updating video details:', error);
        throw new Error(`Failed to update video status: ${error.message}`);
      }

      console.log('✅ Video details updated successfully:', data);

      // Verify the update
      const { data: verifyData } = await supabase
        .from("videos")
        .select("id, status, title")
        .eq("id", videoId)
        .single();

      console.log('🔍 Verification query result:', verifyData);
    });

    return {
      event,
      body: `Successfully ingested ${videoTitle}`,
      stats: {
        totalSegments: transcript.length,
        totalChunks: chunks.length,
        collectionName: getCollectionName(videoId),
      }
    };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // Update video status to FAILED with the error reason
      await step.run("update-status-to-failed", async () => {
        await supabase
          .from("videos")
          .update({
            status: "FAILED",
            failure_reason: errorMessage,
            updated_at: new Date().toISOString(),
          })
          .eq("id", videoId);
      });

      console.error(`Failed to ingest video ${videoId}:`, error);
      throw error; // Re-throw to let Inngest handle retries
    }
  }
);


// Create an API that serves all Inngest functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    ingestVideo,
  ],
});