// src/app/chat/[conversationId]/_components/conversation-view.tsx
'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SendHorizonal, X, Search, Copy, Check, Edit2, RotateCcw, StopCircle } from 'lucide-react';
import { useScope } from '@/app/_context/scope-context';
import { Badge } from '@/components/ui/badge';
import { CitationRenderer } from '@/app/_components/citation-renderer';
import { VideoPreview } from '@/app/_components/video-preview';
import { createClient } from '@/lib/supabase/client';
import { useScrollbarVisibility } from '@/hooks/use-scrollbar-visibility';

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
  const scrollContainerRef = useScrollbarVisibility<HTMLDivElement>();

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

  const { messages, sendMessage, setMessages, stop } = chatHelpers;
  const [loadingStage, setLoadingStage] = useState<'searching' | 'generating' | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoPreview, setVideoPreview] = useState<{
    youtubeId: string;
    timestamp: number;
    title: string;
  } | null>(null);

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

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Detect when we're waiting: track based on message state
  const isWaitingForResponse = useMemo(() => {
    if (messages.length === 0) return false;
    const lastMessage = messages[messages.length - 1];

    // If last message is from user, we're waiting
    if (lastMessage.role === 'user') return true;

    // If we're actively generating (tracked by state), keep showing stop button
    if (isGenerating) return true;

    return false;
  }, [messages, isGenerating]);

  // Track if we manually stopped generation
  const [isStopped, setIsStopped] = useState(false);

  // Simulate loading stages for better UX
  useEffect(() => {
    if (isWaitingForResponse && !isStopped) {
      setLoadingStage('searching');
      const timer = setTimeout(() => {
        setLoadingStage('generating');
      }, 1500); // Switch to "generating" after 1.5s
      return () => clearTimeout(timer);
    } else {
      setLoadingStage(null);
    }
  }, [isWaitingForResponse, isStopped]);

  // Reset stopped state when waiting status changes
  useEffect(() => {
    if (!isWaitingForResponse) {
      setIsStopped(false);
    }
  }, [isWaitingForResponse]);

  // Detect when assistant message has been fully received
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant') {
        const textContent = lastMessage.parts
          .filter((part) => part.type === 'text')
          .map((part) => ('text' in part ? part.text : ''))
          .join('');

        // If assistant message has content, mark generation as complete
        if (textContent.trim().length > 0) {
          const timer = setTimeout(() => {
            setIsGenerating(false);
          }, 100);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || scopedVideos.length === 0) return;

    const userMessage = input;
    setIsGenerating(true);
    sendMessage({ role: 'user', parts: [{ type: 'text', text: userMessage }] });
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
    setScopedVideos([]); // Clear selection when switching to subset mode
  };

  // Copy message to clipboard
  const handleCopy = async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // Start editing a message
  const handleEdit = (messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditedContent(content);
  };

  // Save edited message and regenerate response
  const handleSaveEdit = (messageId: string) => {
    if (!editedContent.trim()) return;

    // Find the message index
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    // Remove all messages after this one (including assistant responses)
    const updatedMessages = messages.slice(0, messageIndex);

    // Don't add the edited message to state - let sendMessage handle it
    setMessages(updatedMessages);

    // Trigger regeneration with the edited message
    setIsGenerating(true);
    sendMessage({ role: 'user', parts: [{ type: 'text', text: editedContent }] });

    setEditingMessageId(null);
    setEditedContent('');
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditedContent('');
  };

  // Regenerate last assistant response
  const handleRegenerate = () => {
    if (messages.length < 2) return;

    const lastMessage = messages[messages.length - 1];

    // Only regenerate if the last message is from assistant
    if (lastMessage.role !== 'assistant') return;

    // Find the last user message before the assistant message
    let lastUserMessageIndex = -1;
    for (let i = messages.length - 2; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserMessageIndex = i;
        break;
      }
    }
    if (lastUserMessageIndex === -1) return;

    const lastUserMessage = messages[lastUserMessageIndex];

    // Extract user message content
    const userContent = lastUserMessage.parts
      .filter(part => part.type === 'text')
      .map(part => ('text' in part ? part.text : ''))
      .join('');

    // Remove both the user message and assistant response
    const filteredMessages = messages.slice(0, lastUserMessageIndex);
    setMessages(filteredMessages);

    // Trigger regeneration by sending the user message again
    // The AI SDK will add it fresh to the messages array
    setIsGenerating(true);
    sendMessage({ role: 'user', parts: [{ type: 'text', text: userContent }] });
  };

  // Handle citation click to show video preview
  const handleCitationClick = (_videoId: string, youtubeId: string, timestamp: number, title: string) => {
    setVideoPreview({ youtubeId, timestamp, title });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Fixed Header Section */}
      <div className="flex-shrink-0 p-4 space-y-4">
        {/* --- Mode Toggle --- */}
        <div className="flex items-center gap-2">
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
          <div className="flex flex-wrap items-center gap-2 pb-2">
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
              <span className="text-sm text-muted-foreground">No videos selected. Click &quot;All Videos&quot; or select from the right sidebar.</span>
            )}
          </div>
        )}
        {/* --- END: Scope Bar --- */}
      </div>

      {/* Scrollable Conversation Area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 custom-scrollbar">
        <div className="space-y-6 pb-4">
          {messages.length > 0 ? (
            <>
              {messages.map((m, index) => {
                const textContent = m.parts
                  .filter((part) => part.type === 'text')
                  .map((part) => ('text' in part ? part.text : ''))
                  .join('');

                const isLastMessage = index === messages.length - 1;
                const isEditing = editingMessageId === m.id;

                return (
                  <div key={m.id} className="group flex items-start gap-4">
                    <Avatar className="h-8 w-8 border">
                      <AvatarFallback>{m.role === 'user' ? 'U' : 'AI'}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-2 overflow-hidden">
                      <p className="font-bold">{m.role === 'user' ? 'You' : 'Assistant'}</p>
                      {isEditing ? (
                        <div className="space-y-2">
                          <Textarea
                            value={editedContent}
                            onChange={(e) => setEditedContent(e.target.value)}
                            className="min-h-[100px]"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleSaveEdit(m.id)}>
                              Update
                            </Button>
                            <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="whitespace-pre-wrap">
                            {m.role === 'assistant' ? (
                              <CitationRenderer
                                text={textContent}
                                videos={videoDetailsMap}
                                onCitationClick={handleCitationClick}
                              />
                            ) : (
                              textContent
                            )}
                          </div>
                          {/* Message Actions */}
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2"
                              onClick={() => handleCopy(textContent, m.id)}
                            >
                              {copiedMessageId === m.id ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                            {m.role === 'user' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2"
                                onClick={() => handleEdit(m.id, textContent)}
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                            )}
                            {m.role === 'assistant' && isLastMessage && !isWaitingForResponse && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2"
                                onClick={handleRegenerate}
                              >
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {isWaitingForResponse && !isStopped && (
                // Only show loading indicator if last message is from user (not assistant)
                messages.length > 0 && messages[messages.length - 1].role === 'user' ? (
                  <div className="flex items-start gap-4">
                    <Avatar className="h-8 w-8 border pulse-avatar">
                      <AvatarFallback>AI</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-2">
                      <p className="font-bold">Assistant</p>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Search className="h-4 w-4 animate-spin" />
                          <span className="text-sm">
                            {loadingStage === 'searching' ? 'Searching knowledge base' : 'Generating response'}
                          </span>
                          <div className="flex gap-1">
                            <span className="thinking-dot">•</span>
                            <span className="thinking-dot">•</span>
                            <span className="thinking-dot">•</span>
                          </div>
                        </div>
                        <div className="h-4 shimmer-text rounded" />
                      </div>
                    </div>
                  </div>
                ) : null
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-muted-foreground">
                {scopedVideos.length > 0
                  ? 'Continue the conversation...'
                  : 'Select a video to continue chatting.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Fixed Input Section */}
      <div className="flex-shrink-0 p-4">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
            placeholder={scopedVideos.length > 0 ? "Continue the conversation..." : "Select videos first..."}
            className="flex-1 min-h-[44px] max-h-[200px] resize-none custom-scrollbar"
            disabled={scopedVideos.length === 0}
            onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
              }
            }}
          />
          {isWaitingForResponse && !isStopped ? (
            <Button
              type="button"
              size="icon"
              aria-label="Stop generating"
              onClick={() => {
                stop();
                setIsStopped(true);
                setIsGenerating(false);
                setLoadingStage(null);
              }}
              variant="destructive"
            >
              <StopCircle className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" size="icon" aria-label="Send message" disabled={scopedVideos.length === 0}>
              <SendHorizonal className="h-4 w-4" />
            </Button>
          )}
        </form>
      </div>

      {/* Video Preview Modal */}
      {videoPreview && (
        <VideoPreview
          youtubeId={videoPreview.youtubeId}
          timestamp={videoPreview.timestamp}
          title={videoPreview.title}
          onClose={() => setVideoPreview(null)}
        />
      )}
    </div>
  );
}
