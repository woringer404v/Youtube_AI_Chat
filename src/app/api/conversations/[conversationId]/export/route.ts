// src/app/api/conversations/[conversationId]/export/route.ts
import { createClient } from '@/lib/supabase/server';
import { NextRequest } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'txt';

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Fetch conversation with messages
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id, title, created_at')
      .eq('id', conversationId)
      .single();

    if (!conversation) {
      return new Response('Conversation not found', { status: 404 });
    }

    const { data: messages } = await supabase
      .from('messages')
      .select('role, content, created_at')
      .eq('conversationId', conversationId)
      .order('created_at', { ascending: true });

    if (!messages) {
      return new Response('No messages found', { status: 404 });
    }

    // Get video links for this conversation to build YouTube URLs
    const { data: videoLinks } = await supabase
      .from('_ConversationToVideo')
      .select('B')
      .eq('A', conversationId);

    const videoIds = videoLinks?.map(link => link.B) || [];

    // Fetch video details (youtube_id needed for URLs)
    const { data: videos } = await supabase
      .from('videos')
      .select('id, youtube_id')
      .in('id', videoIds);

    const videoIdToYoutubeId: Record<string, string> = {};
    videos?.forEach(v => {
      videoIdToYoutubeId[v.id] = v.youtube_id;
    });

    // Function to convert citations to clickable links (same format as CitationRenderer)
    const convertCitations = (text: string, forMarkdown: boolean): string => {
      // Match pattern: [video_id: ID_VALUE, time: TIMESTAMP_VALUE] - same regex as CitationRenderer
      const citationRegex = /\[video_id:\s*([\w-]+),\s*time:\s*(\d+(?:\.\d*)?)s?.*?\]/g;
      let citationCounter = 1;

      return text.replace(citationRegex, (match, videoId, timestamp) => {
        const youtubeId = videoIdToYoutubeId[videoId.trim()];
        if (!youtubeId) return match;

        const timeInSeconds = Math.floor(parseFloat(timestamp));
        const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}&t=${timeInSeconds}s`;

        if (forMarkdown) {
          return `[[${citationCounter++}]](${youtubeUrl})`;
        } else {
          return `[${citationCounter++}] ${youtubeUrl}`;
        }
      });
    };

    let content: string;
    let contentType: string;
    let filename: string;

    if (format === 'md') {
      // Markdown format
      content = `# ${conversation.title}\n\n`;
      content += `*Created: ${new Date(conversation.created_at).toLocaleDateString()}*\n\n---\n\n`;

      messages.forEach((msg) => {
        const role = msg.role === 'user' ? '**You**' : '**Assistant**';
        const processedContent = convertCitations(msg.content, true);
        content += `### ${role}\n\n${processedContent}\n\n---\n\n`;
      });

      contentType = 'text/markdown';
      filename = `${conversation.title}.md`;
    } else if (format === 'pdf') {
      // PDF format - disable for now since it requires proper PDF library
      return new Response('PDF export temporarily disabled. Please use TXT or Markdown format.', {
        status: 400
      });
    } else {
      // Text format (default)
      content = `${conversation.title}\n`;
      content += `Created: ${new Date(conversation.created_at).toLocaleDateString()}\n\n`;
      content += '='.repeat(50) + '\n\n';

      messages.forEach((msg) => {
        const role = msg.role === 'user' ? 'You' : 'Assistant';
        const processedContent = convertCitations(msg.content, false);
        content += `${role}:\n${processedContent}\n\n${'-'.repeat(50)}\n\n`;
      });

      contentType = 'text/plain';
      filename = `${conversation.title}.txt`;
    }

    return new Response(content, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('Export error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
