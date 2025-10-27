// src/app/_components/compose-view.tsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useScrollbarVisibility } from '@/hooks/use-scrollbar-visibility';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { X, Sparkles, FileText, List, MessageSquare, Copy, Download } from 'lucide-react';
import { useScope } from '../_context/scope-context';
import { useModel, AVAILABLE_MODELS } from '../_context/model-context';
import { toast } from 'sonner';

interface ComposeViewProps {
  videoDetailsMap: Record<string, { youtubeId: string; title: string }>;
}

type ComposeTemplate = 'summary' | 'blog-post' | 'outline' | 'social-post';

const TEMPLATES: Record<ComposeTemplate, {
  name: string;
  icon: React.ReactNode;
  description: string;
  placeholder: string;
}> = {
  'summary': {
    name: 'Summary',
    icon: <FileText className="h-4 w-4" />,
    description: 'Generate a concise summary of the key points',
    placeholder: 'A comprehensive summary will be generated here...',
  },
  'blog-post': {
    name: 'Blog Post',
    icon: <MessageSquare className="h-4 w-4" />,
    description: 'Create a detailed blog post with sections',
    placeholder: 'A well-structured blog post will be generated here...',
  },
  'outline': {
    name: 'Outline',
    icon: <List className="h-4 w-4" />,
    description: 'Generate a structured outline of main topics',
    placeholder: 'A hierarchical outline will be generated here...',
  },
  'social-post': {
    name: 'Social Post',
    icon: <MessageSquare className="h-4 w-4" />,
    description: 'Create engaging social media content',
    placeholder: 'Social media posts will be generated here...',
  },
};

export function ComposeView({ videoDetailsMap }: ComposeViewProps) {
  const { scopedVideos, setScopedVideos, scopeMode, setScopeMode, allVideos, setAllVideos } = useScope();
  const { selectedModelId, setSelectedModelId } = useModel();
  const [selectedTemplate, setSelectedTemplate] = useState<ComposeTemplate>('summary');
  const [generatedContent, setGeneratedContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const scrollContainerRef = useScrollbarVisibility<HTMLDivElement>();

  // Initialize allVideos from videoDetailsMap
  useEffect(() => {
    const videoIds = Object.keys(videoDetailsMap);
    setAllVideos(videoIds);
    // Set scopedVideos to all videos initially if in 'all' mode
    if (scopeMode === 'all' && videoIds.length > 0) {
      setScopedVideos(videoIds);
    }
  }, [videoDetailsMap, setAllVideos, scopeMode, setScopedVideos]);

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

  const handleGenerate = async () => {
    if (scopedVideos.length === 0) {
      toast.error('Please select at least one video');
      return;
    }

    setIsGenerating(true);
    setGeneratedContent('');

    try {
      const response = await fetch('/api/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: selectedTemplate,
          videoIds: scopedVideos,
          customPrompt: customPrompt.trim() || undefined,
          modelId: selectedModelId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate content');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let accumulated = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        accumulated += chunk;
        setGeneratedContent(accumulated);
      }

      toast.success('Content generated successfully');
    } catch (error) {
      console.error('Error generating content:', error);
      toast.error('Failed to generate content');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedContent);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([generatedContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTemplate}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Downloaded successfully');
  };

  return (
    <div className="flex h-full flex-col p-4">
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
        <div className="mb-4 flex flex-wrap items-center gap-2 pb-2">
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

      {/* Template Selection and Controls */}
      <div className="mb-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Content Type</label>
            <Select
              value={selectedTemplate}
              onValueChange={(value) => setSelectedTemplate(value as ComposeTemplate)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TEMPLATES).map(([key, template]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2">
                      {template.icon}
                      {template.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Model</label>
            <Select value={selectedModelId} onValueChange={setSelectedModelId}>
              <SelectTrigger>
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

          <div className="space-y-2">
            <label className="text-sm font-medium">Actions</label>
            <div className="flex gap-2">
              <Button
                onClick={handleGenerate}
                disabled={scopedVideos.length === 0 || isGenerating}
                className="flex-1"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {isGenerating ? 'Generating...' : 'Generate'}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Custom Instructions (Optional)</label>
          <Textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Add specific instructions or focus areas..."
            className="resize-none"
            rows={2}
          />
        </div>

        <p className="text-sm text-muted-foreground">
          {TEMPLATES[selectedTemplate].description}
        </p>
      </div>

      {/* Generated Content Display */}
      <div className="flex-1 border rounded-lg dark:border-slate-700 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-3 flex-shrink-0">
          <h3 className="text-sm font-medium">Generated Content</h3>
          {generatedContent && (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <div ref={scrollContainerRef} className="p-4 overflow-y-auto flex-1 custom-scrollbar">
          {isGenerating ? (
            <div className="flex items-center gap-2 text-muted-foreground animate-pulse">
              <Sparkles className="h-4 w-4 animate-spin" />
              <span className="text-sm">Generating content...</span>
            </div>
          ) : generatedContent ? (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
              {generatedContent}
            </div>
          ) : (
            <div className="flex h-[200px] items-center justify-center">
              <p className="text-sm text-muted-foreground">
                {scopedVideos.length > 0
                  ? TEMPLATES[selectedTemplate].placeholder
                  : 'Select videos to generate content.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
