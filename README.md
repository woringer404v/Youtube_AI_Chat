# YouTube AI Chat

A conversational AI system for querying and analyzing YouTube video content. Ingest videos, build a semantic knowledge base, and chat with AI about your video library using RAG (Retrieval-Augmented Generation).

![Architecture Overview](docs/architecture.png)

## 🌟 Features

- **Video Ingestion**: Add individual videos or entire channels (automatically ingests latest 10 videos)
- **Semantic Search**: Vector-based retrieval using ZeroEntropy for accurate context matching
- **Flexible Scoping**: Chat with all videos or select specific subsets for focused conversations
- **Real-time Updates**: Live status tracking of video processing with Supabase real-time subscriptions
- **Multi-Model Support**: Choose between Claude 3.5 Haiku and Claude 3 Haiku
- **Content Generation**: Auto-generate summaries, blog posts, outlines, and social media content
- **Conversation History**: Persistent chat sessions with proper context management
- **Retry Mechanism**: Automatic retry for failed video ingestion

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Frontend (Next.js 15)                          │
│  ┌────────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────────┐   │
│  │  Chat View │  │ Compose View │  │ Video List │  │ Conversation │   │
│  │            │  │              │  │            │  │   History    │   │
│  └────────────┘  └──────────────┘  └────────────┘  └──────────────┘   │
│         │                │                │                 │           │
│         └────────────────┴────────────────┴─────────────────┘           │
│                              │                                           │
│                              ▼                                           │
│                    ┌──────────────────┐                                 │
│                    │ Context Manager  │                                 │
│                    │ (Scope/Model)    │                                 │
│                    └──────────────────┘                                 │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                    ┌────────┴─────────┐
                    │                  │
         ┌──────────▼──────────┐  ┌───▼──────────┐
         │   API Routes        │  │  Middleware  │
         │  /api/chat          │  │  (Auth)      │
         │  /api/compose       │  └──────────────┘
         │  /api/conversations │
         │  /api/inngest       │
         └──────────┬──────────┘
                    │
        ┌───────────┼───────────────────────┐
        │           │                       │
   ┌────▼────┐ ┌───▼──────┐      ┌────────▼─────────┐
   │Supabase │ │Anthropic │      │     Inngest      │
   │         │ │  Claude  │      │  (Background)    │
   │ - Auth  │ │          │      │                  │
   │ - DB    │ │ - Chat   │      │ ┌──────────────┐ │
   │ - RT    │ │ - Compose│      │ │ Ingest Video │ │
   └─────────┘ └──────────┘      │ │   Workflow   │ │
                                  │ └───────┬──────┘ │
                                  └─────────┼────────┘
                                            │
                      ┌─────────────────────┼─────────────────┐
                      │                     │                 │
                 ┌────▼────────┐   ┌───────▼────────┐  ┌────▼─────┐
                 │  YouTubei.js│   │  ZeroEntropy   │  │ YouTube  │
                 │             │   │                │  │Data API  │
                 │- Transcript │   │ - Embeddings   │  │          │
                 │- Metadata   │   │ - Vector Store │  │- Metadata│
                 └─────────────┘   │ - Semantic     │  │(Fallback)│
                                   │   Search       │  └──────────┘
                                   └────────────────┘
```

## 📋 Prerequisites

- Node.js 20+ and pnpm
- Supabase account (for database & auth)
- Anthropic API key (for Claude)
- ZeroEntropy API key (for embeddings)
- YouTube Data API key (optional, for metadata fallback)
- Inngest account (for background jobs)

## 🚀 Setup Instructions

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd Youtube_AI_Chat
pnpm install
```

### 2. Database Setup (Supabase)

1. Create a new Supabase project at https://supabase.com
2. Run the database migrations:

```sql
-- Create profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create videos table
CREATE TABLE videos (
  id TEXT PRIMARY KEY,
  youtube_id TEXT NOT NULL,
  title TEXT NOT NULL,
  thumbnail_url TEXT,
  "profileId" UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('QUEUED', 'PROCESSING', 'READY', 'FAILED')),
  failure_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(youtube_id, "profileId")
);

-- Create conversations table
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  "profileId" UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create messages table
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create conversation-video junction table
CREATE TABLE "_ConversationToVideo" (
  "A" TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  "B" TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  PRIMARY KEY ("A", "B")
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_ConversationToVideo" ENABLE ROW LEVEL SECURITY;

-- RLS Policies (users can only access their own data)
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = "userId");

CREATE POLICY "Users can view own videos" ON videos
  FOR ALL USING ("profileId" IN (
    SELECT id FROM profiles WHERE "userId" = auth.uid()
  ));

CREATE POLICY "Users can view own conversations" ON conversations
  FOR ALL USING ("profileId" IN (
    SELECT id FROM profiles WHERE "userId" = auth.uid()
  ));

-- Enable Realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE videos;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```

### 3. Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

**Required variables:**
- `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY` - From Supabase project settings
- `SUPABASE_SERVICE_ROLE_KEY` - From Supabase (for background jobs)
- `ANTHROPIC_API_KEY` - From https://console.anthropic.com
- `ZERO_ENTROPY_API_KEY` - From https://zeroentropy.ai
- `INNGEST_EVENT_KEY` & `INNGEST_SIGNING_KEY` - From https://app.inngest.com
- `YOUTUBE_API_KEY` - From Google Cloud Console 

### 4. Run Development Server

```bash
pnpm dev
```

Visit http://localhost:3000

### 5. Deploy to Production (Vercel)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add environment variables in Vercel dashboard
# Project Settings → Environment Variables
```

**Post-deployment:**
1. Update Supabase Site URL to your Vercel domain
2. Add Vercel domain to Supabase redirect URLs
3. Sync Inngest app: Visit https://your-app.vercel.app/api/inngest

## 🎯 Design Decisions & Trade-offs

### 1. **RAG Architecture with Semantic Chunking**

**Decision**: Use semantic paragraph-based chunking (10 segments per chunk) instead of fixed-size chunks.

**Rationale**:
- Preserves conversational context in video transcripts
- Better semantic coherence for retrieval
- Reduces chunk boundary issues

**Trade-off**: Slightly variable chunk sizes, but improved relevance.

### 2. **Adaptive K Selection**

**Decision**: Dynamically adjust number of chunks retrieved based on video count:
- Single video: 10 chunks
- Multiple videos: 3-5 chunks per video (max 15 total)

**Rationale**:
- Prevents context window overflow with multiple videos
- Maintains high relevance when focused on single video
- Balances breadth vs. depth of information

**Trade-off**: Less context per video when many are selected.

### 3. **Score-Based Re-ranking**

**Decision**: Retrieve chunks, then sort by relevance score and take top-K.

**Rationale**:
- ZeroEntropy returns relevance scores
- Ensures highest quality chunks regardless of source video
- More accurate than simple concatenation

**Trade-off**: Additional processing, but negligible latency impact.

### 4. **Two-Phase Video Ingestion**

**Decision**: Use Inngest for background processing instead of synchronous ingestion.

**Rationale**:
- Video processing can take 30-60 seconds
- Prevents API timeouts
- Better user experience (non-blocking)
- Automatic retries on failure

**Trade-off**: Slightly more complex architecture, requires Inngest setup.

### 5. **Dual Metadata Fetching**

**Decision**: Use `youtubei.js` with YouTube Data API fallback.

**Rationale**:
- `youtubei.js` provides transcripts (no API quota)
- Official API used only for metadata when needed
- Reduces API quota usage

**Trade-off**: Two dependency systems, but more reliable.

### 6. **Real-time + Polling Hybrid**

**Decision**: Use Supabase real-time subscriptions + polling fallback.

**Rationale**:
- Real-time provides instant updates (best case)
- Polling ensures updates if real-time fails (reliability)
- 10-second polling is non-intrusive

**Trade-off**: Slightly more network traffic, but guarantees updates.

## 🔍 Retrieval & Scoping Approach

### Scoping Modes

1. **All Videos Mode** (Default)
   - Searches across entire knowledge base
   - Adaptive chunk retrieval (3-5 per video)
   - Best for broad questions

2. **Subset Mode**
   - User selects specific videos
   - More chunks per video (up to 10 for single video)
   - Best for focused, deep-dive questions

### Retrieval Pipeline

```
User Query → ZeroEntropy Semantic Search → Score Ranking → Top-K Selection → Context Augmentation → LLM
```

**Steps:**
1. **Query Processing**: Extract user's last message
2. **Collection Filtering**: Only search selected video collections
3. **Semantic Search**: Use ZeroEntropy's `topSnippets` with query
4. **Score Ranking**: Sort all results by relevance score
5. **Top-K Selection**: Take best 10-15 chunks
6. **Context Building**: Format with video ID + timestamp metadata
7. **LLM Call**: Claude generates response with citations

### Citation Format

Responses include inline citations: `[video_id, timestamp]`

Example:
```
The main concept is explained as... [cm123abc, 145.5]
This is further elaborated... [cm123abc, 220.3]
```

## ⚠️ Known Limitations

1. **Video Length**: Very long videos (>3 hours) may hit embedding limits
2. **Transcript Availability**: Requires English transcripts
4. **Search Language**: Optimized for English queries
5. **Model Context**: Limited to ~8k tokens context (Haiku limitation)
6. **YouTube API Quota**: 10,000 units/day (affects metadata fetching)

## 🔮 Future Enhancements

### Short-term
- [ ] Add support for auto-generated captions
- [ ] Implement video chunking for long videos (split processing)
- [ ] Add multi-language support for transcripts
- [ ] Enable video preview/playback with timestamp navigation
- [ ] Add conversation export (Markdown, PDF)

### Medium-term
- [ ] Support for more AI models (GPT-4, Gemini)
- [ ] Advanced filtering (by date, channel, topic)
- [ ] Collaborative features (shared knowledge bases)
- [ ] Analytics dashboard (usage metrics, popular videos)


## 📊 Tech Stack

| Category | Technology | Purpose |
|----------|-----------|---------|
| **Framework** | Next.js 15 | React framework with App Router |
| **Language** | TypeScript | Type safety |
| **UI** | Tailwind CSS + shadcn/ui | Styling and components |
| **Database** | Supabase (PostgreSQL) | Data persistence + Auth + Realtime |
| **AI** | Anthropic Claude | LLM for chat and generation |
| **Embeddings** | ZeroEntropy | Vector embeddings + semantic search |
| **Background Jobs** | Inngest | Async video processing workflows |
| **Video Data** | YouTubei.js + YouTube Data API | Transcripts and metadata |
| **Deployment** | Vercel | Serverless hosting |
