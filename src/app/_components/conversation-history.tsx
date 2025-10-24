// src/app/_components/conversation-history.tsx
import { createClient } from '@/lib/supabase/server';
import { ConversationList } from './conversation-list';
import { UserProfileSection } from './user-profile-section';
import { NewChatButton } from './new-chat-button';

// Define the type for conversations fetched from the DB
type Conversation = {
  id: string;
  title: string;
  created_at: string; // Comes as string from DB
};

export async function ConversationHistory() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch profile first to get the correct profile ID
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("userId", user!.id)
    .single();

  let conversations: Conversation[] = [];
  if (profile) {
    const { data } = await supabase
      .from('conversations')
      .select('id, title, created_at')
      .eq('profileId', profile.id)
      .order('created_at', { ascending: false });
    conversations = data || [];
  }

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight flex-shrink-0">History</h2>
        <NewChatButton />
      </div>

      <ConversationList conversations={conversations} />

      <UserProfileSection userEmail={user!.email!} />
    </div>
  );
}