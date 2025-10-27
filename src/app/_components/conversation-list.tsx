// src/app/_components/conversation-list.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useScrollbarVisibility } from '@/hooks/use-scrollbar-visibility';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MoreVertical, Pencil, Share2, Trash2, Search, FileDown } from 'lucide-react';
import { toast } from 'sonner';

type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

interface ConversationListProps {
  conversations: Conversation[];
}

export function ConversationList({ conversations: initialConversations }: ConversationListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const scrollContainerRef = useScrollbarVisibility<HTMLDivElement>();

  // Filter conversations based on search query
  const filteredConversations = conversations.filter((conv) =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Update local state when initial conversations change
  useEffect(() => {
    setConversations(initialConversations);
  }, [initialConversations]);

  // Set up real-time subscription for conversation changes
  useEffect(() => {
    const supabase = createClient();

    // Subscribe to all conversation events (INSERT, UPDATE, DELETE)
    const channel = supabase
      .channel('conversations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newConv = payload.new as Conversation;
            setConversations((current) => [newConv, ...current]);

            // If we're on the home page, navigate to the new conversation
            if (pathname === '/') {
              router.push(`/chat/${newConv.id}`);
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedConv = payload.new as Conversation;
            console.log('🔄 Conversation updated:', updatedConv.id, 'New title:', updatedConv.title);
            setConversations((current) => {
              // Remove the updated conversation and add it to the top (most recent)
              const filtered = current.filter((conv) => conv.id !== updatedConv.id);
              return [updatedConv, ...filtered];
            });
          } else if (payload.eventType === 'DELETE') {
            const deletedConv = payload.old as Conversation;
            setConversations((current) =>
              current.filter((conv) => conv.id !== deletedConv.id)
            );
          }
        }
      )
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleRenameClick = (conv: Conversation, e: React.MouseEvent) => {
    e.preventDefault();
    setSelectedConversation(conv);
    setNewTitle(conv.title);
    setIsRenameDialogOpen(true);
  };

  const handleDeleteClick = (conv: Conversation, e: React.MouseEvent) => {
    e.preventDefault();
    setSelectedConversation(conv);
    setIsDeleteDialogOpen(true);
  };

  const handleShareClick = async (conv: Conversation, e: React.MouseEvent) => {
    e.preventDefault();
    const shareUrl = `${window.location.origin}/chat/${conv.id}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Link copied to clipboard!');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleExportClick = (conv: Conversation, e: React.MouseEvent) => {
    e.preventDefault();
    setSelectedConversation(conv);
    setIsExportDialogOpen(true);
  };

  const handleExport = async (format: 'txt' | 'md' | 'pdf') => {
    if (!selectedConversation) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/conversations/${selectedConversation.id}/export?format=${format}`);

      if (!response.ok) {
        throw new Error('Failed to export conversation');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedConversation.title}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Conversation exported as ${format.toUpperCase()}`);
      setIsExportDialogOpen(false);
    } catch (error) {
      toast.error('Failed to export conversation');
      console.error('Error exporting conversation:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRename = async () => {
    if (!selectedConversation || !newTitle.trim()) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/conversations/${selectedConversation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      });

      if (!response.ok) {
        throw new Error('Failed to rename conversation');
      }

      toast.success('Conversation renamed successfully');
      setIsRenameDialogOpen(false);
      router.refresh(); // Refresh to show updated title
    } catch (error) {
      toast.error('Failed to rename conversation');
      console.error('Error renaming conversation:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedConversation) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/conversations/${selectedConversation.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete conversation');
      }

      toast.success('Conversation deleted successfully');
      setIsDeleteDialogOpen(false);
      router.push('/'); // Navigate to home
      router.refresh(); // Refresh to update the list
    } catch (error) {
      toast.error('Failed to delete conversation');
      console.error('Error deleting conversation:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Search Bar */}
      <div className="mb-3 relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <div ref={scrollContainerRef} className="flex-1 space-y-2 overflow-y-auto custom-scrollbar">
        {filteredConversations.length > 0 ? (
          filteredConversations.map((conv) => {
            const isActive = pathname === `/chat/${conv.id}`;
            return (
            <div key={conv.id} className="group relative flex items-center min-w-0">
              <Button
                variant="ghost"
                className={`w-full justify-start text-left group-hover:pr-12 pr-2 transition-all min-w-0 ${
                  isActive ? 'bg-accent' : ''
                }`}
                asChild
              >
                <Link href={`/chat/${conv.id}`} className="block min-w-0">
                  <span className="truncate block">
                    {conv.title || 'Untitled Conversation'}
                  </span>
                </Link>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-4 w-4" />
                    <span className="sr-only">More options</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => handleRenameClick(conv, e)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => handleShareClick(conv, e)}>
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => handleExportClick(conv, e)}>
                    <FileDown className="mr-2 h-4 w-4" />
                    Export
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(e) => handleDeleteClick(conv, e)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            );
          })
        ) : (
          <p className="p-2 text-sm text-muted-foreground">No conversations yet.</p>
        )}
      </div>

      {/* Rename Dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Conversation</DialogTitle>
            <DialogDescription>
              Enter a new name for this conversation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Enter conversation title"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRename();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsRenameDialogOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={isLoading || !newTitle.trim()}>
              {isLoading ? 'Renaming...' : 'Rename'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Conversation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{selectedConversation?.title}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isLoading}
            >
              {isLoading ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Conversation</DialogTitle>
            <DialogDescription>
              Choose a format to export &quot;{selectedConversation?.title}&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <Button
              variant="outline"
              onClick={() => handleExport('txt')}
              disabled={isLoading}
              className="justify-start"
            >
              <FileDown className="mr-2 h-4 w-4" />
              Export as Text (.txt)
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport('md')}
              disabled={isLoading}
              className="justify-start"
            >
              <FileDown className="mr-2 h-4 w-4" />
              Export as Markdown (.md)
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsExportDialogOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
