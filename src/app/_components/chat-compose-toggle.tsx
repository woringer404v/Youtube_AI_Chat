// src/app/_components/chat-compose-toggle.tsx
'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, PenTool } from 'lucide-react';
import { ChatView } from './chat-view';
import { ComposeView } from './compose-view';

interface ChatComposeToggleProps {
  videoDetailsMap: Record<string, { youtubeId: string; title: string }>;
}

export function ChatComposeToggle({ videoDetailsMap }: ChatComposeToggleProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'compose'>('chat');

  return (
    <div className="flex h-full flex-col">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'chat' | 'compose')} className="flex-1 flex flex-col">
        <div className="px-4 pt-4 flex justify-center">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="chat" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="compose" className="flex items-center gap-2">
              <PenTool className="h-4 w-4" />
              Compose
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="chat" className="flex-1 mt-0 data-[state=inactive]:hidden">
          <ChatView videoDetailsMap={videoDetailsMap} />
        </TabsContent>

        <TabsContent value="compose" className="flex-1 mt-0 data-[state=inactive]:hidden">
          <ComposeView videoDetailsMap={videoDetailsMap} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
