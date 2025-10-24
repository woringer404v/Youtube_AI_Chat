// src/app/_components/conversation-list.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
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
import { MoreVertical, Pencil, Share2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Conversation = {
  id: string;
  title: string;
  created_at: string;
};

interface ConversationListProps {
  conversations: Conversation[];
}

export function ConversationList({ conversations: initialConversations }: ConversationListProps) {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
          } else if (payload.eventType === 'UPDATE') {
            const updatedConv = payload.new as Conversation;
            setConversations((current) =>
              current.map((conv) =>
                conv.id === updatedConv.id ? updatedConv : conv
              )
            );
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
    } catch (error) {
      toast.error('Failed to copy link');
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
      <div className="flex-1 space-y-2 overflow-y-auto">
        {conversations.length > 0 ? (
          conversations.map((conv) => (
            <div key={conv.id} className="group relative flex items-center min-w-0">
              <Button
                variant="ghost"
                className="w-full justify-start text-left group-hover:pr-12 pr-2 transition-all min-w-0"
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
          ))
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
              Are you sure you want to delete "{selectedConversation?.title}"? This action cannot be undone.
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
    </>
  );
}
