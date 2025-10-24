// src/app/chat/[conversationId]/_components/conversation-view.tsx
'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SendHorizonal, X, Search } from 'lucide-react';
import { useScope } from '@/app/_context/scope-context';
import { Badge } from '@/components/ui/badge';
import { CitationRenderer } from '@/app/_components/citation-renderer';
import { createClient } from '@/lib/supabase/client';

interface ConversationViewProps {
  conversationId: string;
  initialMessages: Array<{
    id: string;
    role: string;
    content: string;
    created_at: string;
  }>;
  initialVideoIds: string[];
  videoDetailsMap: Record<string, { youtubeId: string; title: string }>;
}

export function ConversationView({
  conversationId,
  initialMessages,
  initialVideoIds,
  videoDetailsMap,
}: ConversationViewProps) {
  const { scopedVideos, setScopedVideos, scopeMode, setScopeMode, allVideos, setAllVideos } = useScope();
  const [input, setInput] = useState('');

  // Initialize allVideos from videoDetailsMap
  useEffect(() => {
    const videoIds = Object.keys(videoDetailsMap);
    setAllVideos(videoIds);
  }, [videoDetailsMap, setAllVideos]);

  // Custom transport
  const scopedVideosRef = useRef<string[]>([]);
  scopedVideosRef.current = scopedVideos;

  const transport = useMemo(() => {
    return new DefaultChatTransport({
      api: '/api/chat',
      body: () => ({
        scopedVideoIds: scopedVideosRef.current,
        conversationId: conversationId,
      }),
    });
  }, [conversationId]);

  const chatHelpers = useChat({
    transport,
  });

  const { messages, sendMessage, setMessages } = chatHelpers;

  // Initialize scoped videos and messages on mount
  useEffect(() => {
    if (initialVideoIds.length > 0) {
      setScopedVideos(initialVideoIds);
    }

    if (initialMessages.length > 0) {
      // Convert database messages to AI SDK format
      const convertedMessages = initialMessages.map((msg) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        parts: [{ type: 'text' as const, text: msg.content }],
      }));
      setMessages(convertedMessages);
    }
  }, [initialVideoIds, initialMessages, setScopedVideos, setMessages]);

  // Set up real-time subscription for new messages
  useEffect(() => {
    const supabase = createClient();

    // Subscribe to INSERT events on messages table for this conversation
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversationId=eq.${conversationId}`,
        },
        (payload) => {
          const newMessage = payload.new as {
            id: string;
            role: string;
            content: string;
            created_at: string;
          };

          // Check if message already exists (to avoid duplicates)
          setMessages((currentMessages) => {
            const exists = currentMessages.some((m) => m.id === newMessage.id);
            if (exists) return currentMessages;

            // Add new message in AI SDK format
            return [
              ...currentMessages,
              {
                id: newMessage.id,
                role: newMessage.role as 'user' | 'assistant',
                parts: [{ type: 'text' as const, text: newMessage.content }],
              },
            ];
          });
        }
      )
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, setMessages]);

  // Detect when we're waiting for response
  const isWaitingForResponse = useMemo(() => {
    if (messages.length === 0) return false;
    const lastMessage = messages[messages.length - 1];

    if (lastMessage.role === 'user') return true;

    if (lastMessage.role === 'assistant') {
      const textContent = lastMessage.parts
        .filter((part) => part.type === 'text')
        .map((part) => ('text' in part ? part.text : ''))
        .join('');
      return textContent.trim().length === 0;
    }

    return false;
  }, [messages]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || scopedVideos.length === 0) return;
    sendMessage({ role: 'user', parts: [{ type: 'text', text: input }] });
    setInput('');
  };

  // Function to remove a video from the scope (only in subset mode)
  const removeVideoFromScope = (videoIdToRemove: string) => {
    if (scopeMode === 'subset') {
      setScopedVideos(scopedVideos.filter((id) => id !== videoIdToRemove));
    }
  };

  // Function to reset to all videos
  const resetToAll = () => {
    setScopeMode('all');
    setScopedVideos(allVideos);
  };

  // Function to switch to subset mode
  const switchToSubset = () => {
    setScopeMode('subset');
    // Keep current selection
  };

  return (
    <div className="flex flex-col p-4">
      {/* --- Mode Toggle --- */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Scope:</span>
        <div className="flex gap-1 border rounded-md p-1">
          <Button
            variant={scopeMode === 'all' ? 'default' : 'ghost'}
            size="sm"
            onClick={resetToAll}
            className="h-7 text-xs"
          >
            All Videos
          </Button>
          <Button
            variant={scopeMode === 'subset' ? 'default' : 'ghost'}
            size="sm"
            onClick={switchToSubset}
            className="h-7 text-xs"
          >
            Subset
          </Button>
        </div>
      </div>
      {/* --- END: Mode Toggle --- */}

      {/* --- Scope Bar --- */}
      {scopeMode === 'subset' && (
        <div className="mb-4 flex flex-wrap items-center gap-2 border-b pb-2 dark:border-slate-700">
          <span className="text-sm font-medium text-muted-foreground">Context:</span>
          {scopedVideos.length > 0 ? (
            <>
              {scopedVideos.map((videoId) => (
                <Badge key={videoId} variant="secondary" className="flex items-center gap-1">
                  {videoDetailsMap[videoId]?.title || `Video ${videoId.substring(0, 5)}...`}
                  <button
                    onClick={() => removeVideoFromScope(videoId)}
                    className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
                    aria-label={`Remove video ${videoId} from context`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <Button variant="ghost" size="sm" onClick={resetToAll} className="ml-auto h-7 text-xs">
                Reset to All
              </Button>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">No videos selected. Click "All Videos" or select from the right sidebar.</span>
          )}
        </div>
      )}
      {/* --- END: Scope Bar --- */}

      <div className="flex-1 mb-4">
        <div className="space-y-6 pr-4">
            {messages.length > 0 ? (
              <>
                {messages.map((m) => {
                  const textContent = m.parts
                    .filter((part) => part.type === 'text')
                    .map((part) => ('text' in part ? part.text : ''))
                    .join('');

                  return (
                    <div key={m.id} className="flex items-start gap-4">
                      <Avatar className="h-8 w-8 border">
                        <AvatarFallback>{m.role === 'user' ? 'U' : 'AI'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-2 overflow-hidden">
                        <p className="font-bold">{m.role === 'user' ? 'You' : 'Assistant'}</p>
                        <div className="whitespace-pre-wrap">
                          {m.role === 'assistant' ? (
                            <CitationRenderer text={textContent} videos={videoDetailsMap} />
                          ) : (
                            textContent
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {isWaitingForResponse && (
                  <div className="flex items-start gap-4 animate-pulse">
                    <Avatar className="h-8 w-8 border">
                      <AvatarFallback>AI</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-2">
                      <p className="font-bold">Assistant</p>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Search className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Searching knowledge base...</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className={`flex h-[calc(100vh-${scopedVideos.length > 0 ? '200px' : '150px'})] items-center justify-center`}>
                <p className="text-muted-foreground">
                  {scopedVideos.length > 0
                    ? 'Continue the conversation...'
                    : 'Select a video to continue chatting.'}
                </p>
              </div>
            )}
        </div>
      </div>

      <div className="mt-4">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={scopedVideos.length > 0 ? "Continue the conversation..." : "Select videos first..."}
            className="flex-1"
            disabled={scopedVideos.length === 0}
          />
          <Button type="submit" size="icon" aria-label="Send message" disabled={scopedVideos.length === 0}>
            <SendHorizonal className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
