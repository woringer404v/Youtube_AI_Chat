// src/app/_components/client-layout.tsx
'use client';

import React, { useState } from 'react';
import { KnowledgeBaseExplorer } from "./knowledge-base-explorer";
import { ChatComposeToggle } from './chat-compose-toggle';
import { ScopeProvider } from '../_context/scope-context';
import { ModelProvider } from '../_context/model-context';
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu, LibraryBig, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

// Define the type for our video object
type Video = {
  id: string;
  youtubeId: string;
  title: string;
  thumbnailUrl: string;
  status: 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';
  createdAt?: string;
};

type VideoDetailsMap = Record<string, { youtubeId: string; title: string }>;

export interface Metrics {
  totalVideos: number;
  totalConversations: number;
  lastIngestion: string | null;
  failedVideos: number;
}

interface ClientLayoutProps {
  videos: Video[];
  videoDetailsMap: VideoDetailsMap;
  children: React.ReactNode;
  chatView?: React.ReactNode; // Optional custom chat view
  metrics: Metrics;
}

export function ClientLayout({ videos, videoDetailsMap, children, chatView, metrics }: ClientLayoutProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [knowledgeBaseOpen, setKnowledgeBaseOpen] = useState(false);

  // Desktop sidebar visibility
  const [leftSidebarVisible, setLeftSidebarVisible] = useState(true);
  const [rightSidebarVisible, setRightSidebarVisible] = useState(true);

  // Dynamic grid template based on sidebar visibility
  const getGridTemplate = () => {
    if (leftSidebarVisible && rightSidebarVisible) {
      return 'lg:grid-cols-[300px_1fr_400px]';
    } else if (leftSidebarVisible && !rightSidebarVisible) {
      return 'lg:grid-cols-[300px_1fr]';
    } else if (!leftSidebarVisible && rightSidebarVisible) {
      return 'lg:grid-cols-[1fr_400px]';
    } else {
      return 'lg:grid-cols-[1fr]';
    }
  };

  return (
    <ModelProvider>
      <ScopeProvider>
        <main className="h-screen w-full">
        {/* Desktop Layout (hidden on mobile/tablet) */}
        <div className={`hidden h-full lg:grid ${getGridTemplate()}`}>
          {/* Left Sidebar - Conversation History */}
          {leftSidebarVisible && (
            <div className="h-full bg-slate-100 dark:bg-slate-900 overflow-y-auto">
              {children}
            </div>
          )}

          {/* Center - Chat/Compose */}
          <div className="h-full border-x dark:border-slate-800 relative overflow-y-auto">
            {/* Sidebar Toggle Buttons */}
            <div className="sticky top-0 left-0 right-0 z-10 flex justify-between gap-2 p-2 bg-background/95 backdrop-blur-sm">
              <Button
                key="left-sidebar-toggle"
                variant="ghost"
                size="icon"
                onClick={() => setLeftSidebarVisible(!leftSidebarVisible)}
                className="h-8 w-8"
                title={leftSidebarVisible ? 'Hide history' : 'Show history'}
              >
                {leftSidebarVisible ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
              </Button>
              <Button
                key="right-sidebar-toggle"
                variant="ghost"
                size="icon"
                onClick={() => setRightSidebarVisible(!rightSidebarVisible)}
                className="h-8 w-8"
                title={rightSidebarVisible ? 'Hide videos' : 'Show videos'}
              >
                {rightSidebarVisible ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              </Button>
            </div>
            {chatView || <ChatComposeToggle videoDetailsMap={videoDetailsMap} />}
          </div>

          {/* Right Sidebar - Knowledge Base */}
          {rightSidebarVisible && (
            <div className="h-full bg-slate-100 dark:bg-slate-900 overflow-y-auto">
              <KnowledgeBaseExplorer videos={videos} metrics={metrics} />
            </div>
          )}
        </div>

        {/* Mobile/Tablet Layout */}
        <div className="flex h-full flex-col lg:hidden">
          {/* Mobile Header with Navigation Buttons */}
          <div className="flex items-center justify-between border-b p-2 dark:border-slate-700">
            {/* History Button */}
            <Sheet key="history-sheet" open={historyOpen} onOpenChange={setHistoryOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Menu className="h-5 w-5" />
                  <span className="ml-2">History</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] p-0">
                <VisuallyHidden>
                  <SheetTitle>Conversation History</SheetTitle>
                  <SheetDescription>View and manage your conversation history</SheetDescription>
                </VisuallyHidden>
                {children}
              </SheetContent>
            </Sheet>

            {/* Knowledge Base Button */}
            <Sheet key="knowledge-sheet" open={knowledgeBaseOpen} onOpenChange={setKnowledgeBaseOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm">
                  <LibraryBig className="h-5 w-5" />
                  <span className="ml-2">Videos</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:w-[400px] p-0">
                <VisuallyHidden>
                  <SheetTitle>Knowledge Base</SheetTitle>
                  <SheetDescription>Manage your video library and add new videos</SheetDescription>
                </VisuallyHidden>
                <KnowledgeBaseExplorer videos={videos} metrics={metrics} />
              </SheetContent>
            </Sheet>
          </div>

          {/* Main Content Area - Chat/Compose */}
          <div className="flex-1 overflow-hidden">
            {chatView || <ChatComposeToggle videoDetailsMap={videoDetailsMap} />}
          </div>
        </div>
      </main>
      </ScopeProvider>
    </ModelProvider>
  );
}
