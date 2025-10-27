// src/app/_components/chat-view.tsx
'use client';

import { useState, useMemo, useRef, useEffect } from 'react'; // Added useEffect
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SendHorizonal, X, Search } from 'lucide-react'; // Import Search icon
import { useScope } from '../_context/scope-context';
import { useModel, AVAILABLE_MODELS } from '../_context/model-context';
import { Badge } from '@/components/ui/badge'; // Import Badge
import { CitationRenderer } from './citation-renderer';
import { useScrollbarVisibility } from '@/hooks/use-scrollbar-visibility';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ChatViewProps {
  videoDetailsMap: Record<string, { youtubeId: string; title: string }>;
  onMessagesChange?: (hasMessages: boolean) => void;
}

export function ChatView({ videoDetailsMap, onMessagesChange }: ChatViewProps) {
  const { scopedVideos, setScopedVideos, scopeMode, setScopeMode, allVideos, setAllVideos } = useScope();
  const { selectedModelId, setSelectedModelId } = useModel();
  const [input, setInput] = useState('');
  const scrollContainerRef = useScrollbarVisibility<HTMLDivElement>();

  // Initialize allVideos from videoDetailsMap on mount
  useEffect(() => {
    const videoIds = Object.keys(videoDetailsMap);
    setAllVideos(videoIds);
    // Set scopedVideos to all videos initially if in 'all' mode
    if (scopeMode === 'all' && videoIds.length > 0) {
      setScopedVideos(videoIds);
    }
  }, [videoDetailsMap, setAllVideos, scopeMode, setScopedVideos]);

  // We need video titles for the badges. Let's assume we fetch them elsewhere or pass them down.
  // For now, we'll just show the IDs. We'll improve this later if needed.
  // const [videoDetails, setVideoDetails] = useState<Record<string, { title: string }>>({});

  // Fetch video details (titles) when scopedVideos change - Placeholder
  // useEffect(() => {
  //   const fetchTitles = async () => {
  //     // In a real app, you might fetch titles from Supabase based on scopedVideos IDs
  //     // For now, let's just use IDs as placeholders
  //     const details: Record<string, { title: string }> = {};
  //     scopedVideos.forEach(id => {
  //       details[id] = { title: `Video ${id.substring(0, 5)}...` }; // Placeholder title
  //     });
  //     setVideoDetails(details);
  //   };
  //   if (scopedVideos.length > 0) {
  //     fetchTitles();
  //   } else {
  //     setVideoDetails({});
  //   }
  // }, [scopedVideos]);


  // Custom transport with scopedVideos and modelId
  const scopedVideosRef = useRef<string[]>([]);
  const selectedModelIdRef = useRef<string>('');
  scopedVideosRef.current = scopedVideos;
  selectedModelIdRef.current = selectedModelId;

  const transport = useMemo(() => {
    return new DefaultChatTransport({
      api: '/api/chat',
      body: () => ({
        scopedVideoIds: scopedVideosRef.current,
        modelId: selectedModelIdRef.current
      }),
    });
  }, []);

  const chatHelpers = useChat({ transport });
  const { messages, sendMessage } = chatHelpers;

  // Notify parent when messages change
  useEffect(() => {
    if (onMessagesChange) {
      onMessagesChange(messages.length > 0);
    }
  }, [messages.length, onMessagesChange]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Detect when we're waiting: last message is user OR last assistant message is empty/incomplete
  const isWaitingForResponse = useMemo(() => {
    if (messages.length === 0) return false;
    const lastMessage = messages[messages.length - 1];

    // If last message is from user, we're waiting
    if (lastMessage.role === 'user') return true;

    // If last message is from assistant but has no content, we're still loading
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
    setScopedVideos([]); // Clear selection when switching to subset mode
  };


  return (
    <div className="flex flex-col h-full overflow-hidden">
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

        {/* --- Model Selection --- */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Model:</span>
          <Select value={selectedModelId} onValueChange={setSelectedModelId}>
            <SelectTrigger className="w-[250px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(AVAILABLE_MODELS).map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* --- END: Model Selection --- */}
      </div>

      {/* Scrollable Conversation Area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 custom-scrollbar">
        <div className="space-y-6 pb-4">
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

              {/* Show search indicator when waiting for response */}
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
            <div className="flex h-full items-center justify-center">
              <p className="text-muted-foreground">
                {scopedVideos.length > 0
                  ? 'Ask a question about the selected videos...'
                  : 'Select a video to start chatting.'}
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
            placeholder={scopedVideos.length > 0 ? "Ask about selected videos..." : "Select videos first..."}
            className="flex-1 min-h-[44px] max-h-[200px] resize-none custom-scrollbar"
            disabled={scopedVideos.length === 0}
            onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
              }
            }}
          />
          <Button type="submit" size="icon" aria-label="Send message" disabled={scopedVideos.length === 0}>
            <SendHorizonal className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}