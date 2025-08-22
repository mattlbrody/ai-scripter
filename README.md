# AI Sales Manager - Real-time Sales Call Coaching

Real-time sales call assistant that provides instant coaching suggestions during live calls. Listens to browser-based dialer audio, transcribes with Deepgram Nova-2, detects customer intent, and displays the best historical response in an always-on-top companion window.

## Key Features

- **Real-time Processing**: <500ms latency from lead speech to suggestion display
- **Smart Intent Detection**: Classifies customer statements into objections, pricing questions, competitor mentions, interest signals, and scheduling requests
- **Vector-based Response Matching**: Uses OpenAI embeddings and pgvector for semantic similarity search
- **Browser Integration**: Chrome extension captures tab audio without invasive permissions
- **Non-intrusive UI**: Floating sidecar window that auto-shows/hides based on conversation flow

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│Chrome Dialer │────▶│  Extension   │────▶│  WebSocket   │
│     Tab      │     │(Audio Capture)│     │   Backend    │
└──────────────┘     └──────────────┘     └──────────────┘
                             │                     │
                             ▼                     ▼
                     ┌──────────────┐     ┌──────────────┐
                     │Sidecar Window│◀────│  Deepgram    │
                     │   (React)    │     │  Streaming   │
                     └──────────────┘     └──────────────┘
                                                   │
                                          ┌────────▼────────┐
                                          │Intent Classifier│
                                          │  + Embeddings   │
                                          └────────┬────────┘
                                                   │
                                          ┌────────▼────────┐
                                          │   Supabase     │
                                          │  (pgvector)    │
                                          └─────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- Chrome browser
- Supabase account
- Deepgram API key
- OpenAI API key

### 1. Database Setup

```bash
# Create Supabase project and run migration
psql $PG_DSN < database/001_init.sql
```

### 2. Environment Configuration

```bash
cp .env.example .env
# Edit .env with your credentials:
# - PG_DSN (Supabase connection string)
# - DEEPGRAM_API_KEY
# - OPENAI_API_KEY
# - SUPABASE_URL & keys
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start Development Servers

```bash
# Terminal 1: Backend
npm run dev:backend

# Terminal 2: Admin UI
npm run dev:admin

# Terminal 3: Sidecar UI
npm run dev:sidecar

# Terminal 4: Build extension
npm run dev:extension
```

### 5. Install Chrome Extension

1. Open Chrome and navigate to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/dist` folder

### 6. Configure Dialer Detection

1. Click extension icon in Chrome
2. Add your dialer domain (e.g., `app.aircall.io`)
3. Extension will auto-detect call start/end

## First-Time Setup Flow

### Admin Setup
1. Upload sample calls (WAV/MP3 files)
2. Review auto-generated intents and responses
3. Approve/edit responses in review queue
4. System learns from your edits

### Rep Experience
1. Log into browser dialer normally
2. On call connect, sidecar window appears
3. Lead speaks → suggestion card shows
4. Card auto-dismisses when rep starts talking

## Performance Targets

- **E2E Latency**: ≤500ms P50, ≤800ms P95
- **Similarity Threshold**: 0.80 default (per-intent tunable)
- **Early Show**: 0.88 threshold for partial turn matching
- **Card Stack**: Maximum 2 suggestions visible

## API Endpoints

### WebSocket
- `ws://localhost:3001/ws` - Audio streaming and real-time events

### REST API
- `GET /api/health` - Service health check
- `POST /api/calls/upload` - Upload call for processing
- `GET /api/responses/intents` - List active intents
- `POST /api/responses` - Create new response
- `GET /api/admin/review-queue` - Get pending review items
- `PATCH /api/admin/review-queue/:id` - Approve/reject response

## Production Deployment

### Backend (Fly.io)

```bash
fly launch --name ai-sales-backend
fly secrets set DEEPGRAM_API_KEY=... OPENAI_API_KEY=...
fly deploy
```

### Database (Supabase)
- Enable pgvector extension
- Apply migrations
- Configure RLS policies
- Set up connection pooling

### Extension Distribution
- Build production bundle: `npm run build:extension`
- Upload to Chrome Web Store or distribute .crx internally

## Testing

```bash
# Unit tests
npm test

# E2E latency test
npm run test:latency

# Load test (100 concurrent connections)
npm run test:load
```

## Configuration

### Similarity Thresholds
Edit in `.env` or per-intent in database:
- Objection: 0.80
- Pricing: 0.82
- Competitor: 0.78
- Interest: 0.85
- Scheduling: 0.83

### Turn Detection
- Silence threshold: 200-300ms
- Min tokens: 6
- Max query tokens: 128

## Troubleshooting

### No suggestions showing
- Check similarity threshold (may be too high)
- Verify responses exist for detected intent
- Check WebSocket connection in Network tab

### High latency
- Ensure backend deployed in same region as Supabase
- Check Deepgram streaming configuration
- Monitor embedding cache hit rate

### Audio not capturing
- Verify Chrome extension permissions
- Check tab audio availability (some sites block capture)
- Ensure offscreen document is created

## License

Proprietary - All rights reserved