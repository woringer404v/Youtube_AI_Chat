'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';

export function NewChatButton() {
  const router = useRouter();
  const pathname = usePathname();

  const handleNewChat = () => {
    // If already on home page, just refresh
    if (pathname === '/') {
      window.location.reload();
      return;
    }

    // Navigate to home with a timestamp to force re-render
    router.push(`/?t=${Date.now()}`);

    // Also refresh the router cache
    setTimeout(() => {
      router.refresh();
    }, 100);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleNewChat}
      className="flex-shrink-0"
    >
      <PlusCircle className="mr-2 h-4 w-4" /> New Chat
    </Button>
  );
}
