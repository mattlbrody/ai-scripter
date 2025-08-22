# Supabase Edge Functions Setup

This simplified architecture uses Supabase Edge Functions instead of a separate backend server.

## Prerequisites

1. Install Supabase CLI:
```bash
npm install -g supabase
```

2. Link to your project:
```bash
supabase link --project-ref lqsbxkgtkmroqenbmzrt
```

## Deploy Edge Functions

1. Set secrets for the Edge Functions:
```bash
supabase secrets set DEEPGRAM_API_KEY=your_deepgram_key
supabase secrets set OPENAI_API_KEY=your_openai_key
```

2. Deploy the functions:
```bash
supabase functions deploy process-audio
supabase functions deploy generate-suggestion
supabase functions deploy generate-embedding
```

## Create Storage Bucket

In your Supabase dashboard:
1. Go to Storage
2. Create a new bucket called `calls`
3. Set it to public (or configure RLS policies)

## Setup Complete!

Now you can:

1. Run the admin UI:
```bash
cd admin-ui
npm install
npm run dev
```

2. Access the admin dashboard at `http://localhost:5173`

3. Create your first organization and user account

## How It Works

1. **Admin uploads call** → File goes to Supabase Storage
2. **Edge Function processes audio** → Deepgram transcribes, extracts turns
3. **For each lead turn** → Generate suggestion using OpenAI embeddings
4. **Suggestions stored** → Available for review in admin UI
5. **No backend server needed!** Everything runs on Supabase

## Chrome Extension

The Chrome extension can now connect directly to Supabase Edge Functions for real-time processing.

Update `extension/src/lib/websocket.ts` to use:
```typescript
const SUPABASE_URL = 'https://lqsbxkgtkmroqenbmzrt.supabase.co'
const SUPABASE_ANON_KEY = 'your_anon_key'
```

## Benefits of This Approach

✅ No backend server to manage
✅ Automatic scaling with Supabase
✅ Built-in authentication
✅ Simpler deployment
✅ Lower costs (serverless)
✅ Everything in one place