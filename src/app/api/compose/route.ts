// src/app/api/compose/route.ts
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import ZeroEntropy from 'zeroentropy';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 30;

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

const TEMPLATE_PROMPTS = {
  summary: `You are a professional content summarizer. Based on the provided video transcript context, create a comprehensive summary that:
- Captures all key points and main ideas
- Maintains logical flow and structure
- Highlights important takeaways
- Is concise yet thorough
- Uses clear, professional language`,

  'blog-post': `You are a professional blog writer. Based on the provided video transcript context, create an engaging blog post that:
- Has an attention-grabbing introduction
- Is well-structured with clear sections and headings
- Explains concepts thoroughly with examples
- Maintains reader engagement throughout
- Includes a compelling conclusion
- Uses a conversational yet professional tone`,

  outline: `You are a content organizer. Based on the provided video transcript context, create a detailed hierarchical outline that:
- Organizes information by main topics and subtopics
- Uses clear hierarchical structure (I, A, 1, a, etc.)
- Captures all key points in logical order
- Is easy to scan and understand
- Maintains consistency in formatting`,

  'social-post': `You are a social media content creator. Based on the provided video transcript context, create engaging social media content that:
- Captures attention immediately
- Is concise and impactful
- Includes key insights or quotes
- Uses appropriate tone for social platforms
- Encourages engagement
- Consider creating multiple variations for different platforms`,
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { template, videoIds, customPrompt, modelId } = body;

    if (!template || !TEMPLATE_PROMPTS[template as keyof typeof TEMPLATE_PROMPTS]) {
      return new Response('Invalid template', { status: 400 });
    }

    if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
      return new Response('At least one video must be selected', { status: 400 });
    }

    // Determine which model to use (default to Haiku if not specified)
    const selectedModelId = modelId && modelId in AVAILABLE_MODELS
      ? modelId
      : 'claude-3-haiku-20240307';

    const model = anthropic(selectedModelId);

    // Authentication
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    console.log(`📝 Compose request - Template: ${template}, Videos: ${videoIds.length}, Model: ${selectedModelId}`);

    // Retrieve context from ZeroEntropy
    const client = getZeroEntropyClient();
    const allResults: Array<{
      content: string;
      path: string;
      score?: number;
    }> = [];

    // Generic query based on template type
    const queries = {
      summary: 'main points key ideas important concepts',
      'blog-post': 'detailed explanation examples use cases',
      outline: 'topics structure organization main ideas',
      'social-post': 'key insights quotes highlights takeaways',
    };

    const query = customPrompt || queries[template as keyof typeof queries];

    // Adaptive chunks per video based on selection size
    const chunksPerVideo = videoIds.length === 1 ? 15 : Math.max(5, Math.min(10, Math.ceil(25 / videoIds.length)));

    for (const videoId of videoIds) {
      const collectionName = `video-${videoId}`;

      try {
        console.log(`🔍 Querying collection: ${collectionName} (k=${chunksPerVideo})`);

        const snippetResponse = await client.queries.topSnippets({
          collection_name: collectionName,
          query: query,
          k: chunksPerVideo, // Adaptive chunks per video
          precise_responses: false,
        });

        if (snippetResponse?.results) {
          console.log(`   Found ${snippetResponse.results.length} chunks`);
          allResults.push(...snippetResponse.results);
        }
      } catch (error: any) {
        if (error.message?.includes('not found') || error.status === 404) {
          console.log(`   ⚠️ Collection ${collectionName} not found`);
        } else {
          console.error(`   ❌ Error querying ${collectionName}:`, error.message);
        }
      }
    }

    console.log(`📊 Retrieved ${allResults.length} total chunks`);

    // Sort by relevance score and take top results for compose mode
    const sortedResults = allResults
      .filter(result => result.score !== undefined)
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    const topK = Math.min(15, sortedResults.length);
    const topResults = sortedResults.slice(0, topK);

    console.log(`📊 Score-based ranking applied. Using top ${topResults.length} chunks for composition (scores: ${topResults.slice(0, 3).map(r => r.score?.toFixed(3)).join(', ')}...)`);

    // Format context
    let context = '';
    if (topResults.length > 0) {
      context = topResults
        .map((result, index) => {
          const text = result.content || '';
          const pathParts = result.path.split('/');
          const videoId = pathParts[0];
          const filename = pathParts[1] || '';
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

    // Build system prompt
    const templatePrompt = TEMPLATE_PROMPTS[template as keyof typeof TEMPLATE_PROMPTS];
    const systemPrompt = `${templatePrompt}

${customPrompt ? `\nAdditional Instructions: ${customPrompt}\n` : ''}

CONTEXT FROM VIDEO TRANSCRIPTS:
${context}

Generate the content based on the above context. Do not include citations or references to chunk numbers. Create natural, flowing content.`;

    console.log('🧠 Generating content with AI...');

    // Stream the AI response
    const result = streamText({
      model,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Please generate a ${template.replace('-', ' ')} based on the provided video transcript context.`,
        },
      ],
    });

    console.log('✅ Streaming response to client');

    // Return as a text stream
    return new Response(result.textStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });

  } catch (error: any) {
    console.error('Compose API error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
