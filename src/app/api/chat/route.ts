// src/app/api/chat/route.ts
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import ZeroEntropy from 'zeroentropy';
import { createClient } from '@/lib/supabase/server'; // 👈 ADDED: Import Supabase server client

// Prevent serverless function timeout
export const maxDuration = 30;

// Initialize ZeroEntropy client
function getZeroEntropyClient(): ZeroEntropy {
  const apiKey = process.env.ZERO_ENTROPY_API_KEY;
  if (!apiKey) {
    throw new Error('ZERO_ENTROPY_API_KEY environment variable is not set');
  }
  return new ZeroEntropy({ apiKey });
}

// Available Anthropic models
const AVAILABLE_MODELS = {
  'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',
  'claude-3-haiku-20240307': 'Claude 3 Haiku',
} as const;

export async function POST(req: Request) {
  try {
    // Parse the incoming JSON request body
    const body = await req.json();
    console.log('📩 Received request body:', JSON.stringify(body, null, 2));

    const { messages, scopedVideoIds, conversationId, modelId } = body;

    // Determine which model to use (default to Haiku if not specified)
    const selectedModelId = modelId && modelId in AVAILABLE_MODELS
      ? modelId
      : 'claude-3-haiku-20240307';

    const model = anthropic(selectedModelId);
    console.log(`🤖 Using model: ${selectedModelId}`);

    // --- NEW: Authentication Block (for saving data) ---
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("userId", user.id)
      .single();

    if (!profile) {
      return new Response("User profile not found", { status: 404 });
    }
    const profileId = profile.id;
    // --- END: Authentication Block ---


    if (!messages || !Array.isArray(messages)) {
      console.log('❌ Invalid request: messages not an array');
      return new Response('Invalid request: messages array required', { status: 400 });
    }

    // Validate that scoped video IDs are provided
    if (!scopedVideoIds || !Array.isArray(scopedVideoIds) || scopedVideoIds.length === 0) {
      console.log('❌ Invalid request: scopedVideoIds missing or empty', { scopedVideoIds });
      return new Response('Invalid request: at least one video must be selected', { status: 400 });
    }

    console.log('✅ Scoped video IDs:', scopedVideoIds);

    // Extract the last user message content for retrieval
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      return new Response('Invalid request: last message must be from user', { status: 400 });
    }

    // Extract text content from message parts (AI SDK v3 format)
    let userQuery = '';
    if (lastMessage.parts && Array.isArray(lastMessage.parts)) {
      userQuery = lastMessage.parts
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text)
        .join(' ');
    } else if (typeof lastMessage.content === 'string') {
      // Fallback for older message format
      userQuery = lastMessage.content;
    }

    if (!userQuery.trim()) {
      return new Response('Invalid request: user message is empty', { status: 400 });
    }

    console.log('User query:', userQuery);

    // RETRIEVAL: Search ZeroEntropy for relevant video chunks
    // Query each selected video's collection separately (filter-first approach)
    const client = getZeroEntropyClient();

    const allResults: Array<{
      content: string;
      path: string;
      score?: number;
    }> = [];

    // Dynamically adjust k based on number of videos selected
    // For single video: get 10 chunks, for multiple: get 3-5 per video
    const chunksPerVideo = scopedVideoIds.length === 1 ? 10 : Math.max(3, Math.min(5, Math.ceil(15 / scopedVideoIds.length)));

    for (const videoId of scopedVideoIds) {
      const collectionName = `video-${videoId}`;

      try {
        console.log(`🔍 Querying collection: ${collectionName} (k=${chunksPerVideo})`);

        const snippetResponse = await client.queries.topSnippets({
          collection_name: collectionName,
          query: userQuery,
          k: chunksPerVideo, // Adaptive chunks per video
          precise_responses: false, // Get larger chunks (~2000 chars)
        });

        if (snippetResponse?.results) {
          console.log(`   Found ${snippetResponse.results.length} chunks in ${collectionName}`);
          allResults.push(...snippetResponse.results);
        }
      } catch (error: any) {
        // If collection doesn't exist for this video, skip it
        if (error.message?.includes('not found') || error.status === 404) {
          console.log(`   ⚠️ Collection ${collectionName} not found (video may not be ingested yet)`);
        } else {
          console.error(`   ❌ Error querying ${collectionName}:`, error.message);
        }
      }
    }

    console.log(`📊 Retrieved ${allResults.length} total chunks from ${scopedVideoIds.length} video(s)`);

    // Sort by relevance score (descending) and take top results
    // ZeroEntropy returns scores where higher is more relevant
    const sortedResults = allResults
      .filter(result => result.score !== undefined) // Ensure score exists
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    // Take top 10 results for better context, or all if fewer
    const topK = Math.min(10, sortedResults.length);
    const topFilteredResults = sortedResults.slice(0, topK);

    console.log(`📊 Score-based ranking applied. Using top ${topFilteredResults.length} chunks (scores: ${topFilteredResults.slice(0, 3).map(r => r.score?.toFixed(3)).join(', ')}...)`);

    // AUGMENTATION: Format retrieved results into context
    let context = '';
    if (topFilteredResults.length > 0) {
      context = topFilteredResults
        .map((result, index) => {
          const text = result.content || '';

          // Extract video ID and timestamp from path
          // Path format: "videoId/chunk_XXX_YYYs.txt"
          const pathParts = result.path.split('/');
          const videoId = pathParts[0];
          const filename = pathParts[1] || '';

          // Extract timestamp from filename (e.g., "chunk_220_751.5s.txt" → "751.5")
          const timestampMatch = filename.match(/chunk_\d+_(\d+(?:\.\d+)?)s/);
          const startTime = timestampMatch ? timestampMatch[1] : '0';

          return `[Chunk ${index + 1}]
Video ID: ${videoId}
Timestamp: ${startTime}s
Content: ${text}
---`;
        })
        .join('\n\n');
    } else {
      context = 'No relevant information found in the selected video transcripts.';
    }

    console.log('Context length:', context.length);
    console.log('--- CONTEXT ---');
    console.log(context.substring(0, 500) + '...'); // Log the start of the context
    console.log('--- END CONTEXT ---');

    // GENERATION: Create system prompt for RAG
    const systemPrompt = `You are a helpful AI assistant that answers questions based ONLY on the provided video transcript context.

IMPORTANT INSTRUCTIONS:
1.  Base your entire answer STRICTLY on the provided context.
2.  If the answer is not in the context, state: "I don't have information about that in the provided video transcripts." Do NOT use outside knowledge.
3.  **For EACH piece of information or claim you make, immediately cite the source chunk it came from using the format [video_id, time] right after the sentence or point. where video_id and time are the respective values**
4.  If multiple chunks support a single point, cite them all immediately after, like this: [video_id1, time1] [video_id2, time2].
5.  Be concise and accurate. Do not add introductory or concluding remarks not derived from the context.

CONTEXT FROM VIDEO TRANSCRIPTS:
${context}`;

    // Convert messages to the format expected by streamText
    const conversationHistory = messages.map((msg: any) => {
      let content = '';
      if (msg.parts && Array.isArray(msg.parts)) {
        content = msg.parts
          .filter((part: any) => part.type === 'text')
          .map((part: any) => part.text)
          .join(' ');
      } else if (typeof msg.content === 'string') {
        content = msg.content;
      }

      return {
        role: msg.role,
        content,
      };
    });

    console.log('🧠 Calling AI model with streamText...');

    // Stream the AI response
    const result = streamText({
      model,
      system: systemPrompt,
      messages: conversationHistory,
      // --- NEW: onFinish Callback for Saving ---
      onFinish: async ({ text }) => {
        // This code runs *after* the entire response has streamed to the client
        console.log('✅ Stream finished. Saving conversation to database...');
        const cuid = require('cuid'); // 👈 **1. Import/Require cuid**

        try {
          let activeConversationId = conversationId;

          // If no conversationId provided, create a new conversation (first message)
          if (!activeConversationId && messages.length === 1) {
            // **👇 2. Generate ID before insert**
            const newConversationId = cuid();
            console.log(`   Generating new conversation ID: ${newConversationId}`);

            // 1. Create a new conversation record
            const { error: convError } = await supabase
              .from('conversations')
              .insert({
                id: newConversationId, // 👈 **3. Provide the generated ID**
                profileId: profileId,
                title: userQuery.substring(0, 50) + (userQuery.length > 50 ? '...' : ''), // Auto-generate title
              })
              .single();

            if (convError) throw new Error(`Failed to create conversation: ${convError.message}`);
            activeConversationId = newConversationId;
            console.log(`   Created new conversation with ID: ${activeConversationId}`);

            // 2. Link the selected videos to this conversation
            const links = scopedVideoIds.map((videoId: string) => ({
              A: activeConversationId,
              B: videoId
            }));
            const { error: linkError } = await supabase.from('_ConversationToVideo').insert(links);
            if (linkError) throw new Error(`Failed to link videos: ${linkError.message}`);
            console.log(`   Linked ${links.length} videos to conversation.`);
          }

          // Save messages (for both new and existing conversations)
          if (activeConversationId) {
            const messagesToSave = [
              { id: cuid(), conversationId: activeConversationId, role: 'user', content: userQuery },
              { id: cuid(), conversationId: activeConversationId, role: 'assistant', content: text },
            ];
            const { error: msgError } = await supabase.from('messages').insert(messagesToSave);
            if (msgError) throw new Error(`Failed to save messages: ${msgError.message}`);
            console.log(`   Saved user and assistant messages to conversation ${activeConversationId}.`);
          }

        } catch (saveError: any) {
          console.error('❌ Error saving conversation to database:', saveError);
        }
      },
      // --- END: onFinish Callback ---
    });

    console.log('✅ AI stream object created. Returning response to frontend.');
    console.log(result);

    // Return streaming response
    return result.toUIMessageStreamResponse();

  } catch (error: any) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}