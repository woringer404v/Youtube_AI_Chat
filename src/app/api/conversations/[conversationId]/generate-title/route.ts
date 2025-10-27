// src/app/api/conversations/[conversationId]/generate-title/route.ts
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 10;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;

    // Authenticate user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Get the conversation and first message (just the user's question)
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversationId', conversationId)
      .order('created_at', { ascending: true })
      .limit(1); // Just get the first user message

    if (messagesError || !messages || messages.length === 0) {
      return new Response('Messages not found', { status: 404 });
    }

    const firstMessage = messages[0];
    if (firstMessage.role !== 'user') {
      return new Response('First message must be from user', { status: 400 });
    }

    // Generate title using Claude based on the user's question
    const model = anthropic('claude-3-haiku-20240307');

    const { text: generatedTitle } = await generateText({
      model,
      prompt: `Based on the following user question, generate a short, descriptive title (maximum 6 words). The title should capture the main topic or question. Return ONLY the title, nothing else.

User Question: ${firstMessage.content}

Title:`,
    });

    // Clean up the title (remove quotes, trim, limit length)
    const cleanTitle = generatedTitle
      .replace(/^["']|["']$/g, '') // Remove leading/trailing quotes
      .trim()
      .substring(0, 60); // Limit to 60 chars

    // Update the conversation title
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ title: cleanTitle })
      .eq('id', conversationId);

    if (updateError) {
      console.error('Failed to update conversation title:', updateError);
      return new Response('Failed to update title', { status: 500 });
    }

    return Response.json({ title: cleanTitle });

  } catch (error) {
    console.error('Generate title error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: errorMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
