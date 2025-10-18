# AI Sales Manager Project

## Project Overview
This project builds a browser-based assistant that listens to live sales calls and shows sales reps the **best responses from top reps** in near real time.  
The goal is to help weaker reps replicate proven high-performing responses.  

Key behaviors:
- App listens to live calls made over browser-based dialers.  
- Detects when the **lead** is speaking vs the **agent**.  
- Transcribes the lead’s utterance using Deepgram Nova-2.  
- Embeds and searches against a Supabase vector database of curated lead+response pairs.  
- Displays the **lead’s text**, **detected intent**, and the **best matching response** in a floating popup.  
- If no close match is found (below similarity threshold), show **“No close matches.”**  
- Popup hides automatically when the agent begins speaking again.  

---

## Database Schema
Managed with **Supabase Postgres + pgvector**.  

### SQL

CREATE TABLE public.calls (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  external_id text,
  agent_id uuid,
  phone_number text,
  audio_url text,
  duration_seconds integer,
  status USER-DEFINED DEFAULT 'processing'::call_status,
  metadata jsonb DEFAULT '{}'::jsonb,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT calls_pkey PRIMARY KEY (id),
  CONSTRAINT calls_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.users(id),
  CONSTRAINT calls_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id)
);

CREATE TABLE public.embeddings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  response_id uuid NOT NULL UNIQUE,
  vec USER-DEFINED NOT NULL,
  model text DEFAULT 'text-embedding-3-small'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT embeddings_pkey PRIMARY KEY (id),
  CONSTRAINT embeddings_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id),
  CONSTRAINT embeddings_response_id_fkey FOREIGN KEY (response_id) REFERENCES public.responses(id)
);

CREATE TABLE public.intents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  label text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  threshold numeric DEFAULT 0.80 CHECK (threshold >= 0.50 AND threshold <= 1.00),
  priority integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT intents_pkey PRIMARY KEY (id),
  CONSTRAINT intents_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id)
);

CREATE TABLE public.memberships (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid NOT NULL,
  role USER-DEFINED NOT NULL DEFAULT 'agent'::user_role,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT memberships_pkey PRIMARY KEY (id),
  CONSTRAINT memberships_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id),
  CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

CREATE TABLE public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT organizations_pkey PRIMARY KEY (id)
);

CREATE TABLE public.responses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  intent_id uuid NOT NULL,
  text text NOT NULL,
  source_call_id uuid,
  source_turn_id uuid,
  rating numeric DEFAULT 0.50,
  usage_count integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT responses_pkey PRIMARY KEY (id),
  CONSTRAINT responses_intent_id_fkey FOREIGN KEY (intent_id) REFERENCES public.intents(id),
  CONSTRAINT responses_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id)
);

CREATE TABLE public.review_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  call_id uuid NOT NULL,
  turn_id uuid NOT NULL,
  lead_text text NOT NULL,
  proposed_intent_id uuid,
  proposed_response text,
  confidence numeric,
  status USER-DEFINED DEFAULT 'pending'::review_status,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT review_queue_pkey PRIMARY KEY (id),
  CONSTRAINT review_queue_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.calls(id),
  CONSTRAINT review_queue_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id),
  CONSTRAINT review_queue_proposed_intent_id_fkey FOREIGN KEY (proposed_intent_id) REFERENCES public.intents(id),
  CONSTRAINT review_queue_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id),
  CONSTRAINT review_queue_turn_id_fkey FOREIGN KEY (turn_id) REFERENCES public.turns(id)
);

CREATE TABLE public.suggestions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  call_id uuid NOT NULL,
  turn_id uuid NOT NULL,
  intent_id uuid,
  response_id uuid,
  lead_text text NOT NULL,
  suggested_text text,
  similarity_score numeric,
  decision text NOT NULL CHECK (decision = ANY (ARRAY['suggestion'::text, 'no_match'::text])),
  outcome USER-DEFINED,
  latency_ms integer,
  shown_at timestamp with time zone,
  dismissed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT suggestions_pkey PRIMARY KEY (id),
  CONSTRAINT suggestions_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.calls(id),
  CONSTRAINT suggestions_intent_id_fkey FOREIGN KEY (intent_id) REFERENCES public.intents(id),
  CONSTRAINT suggestions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id),
  CONSTRAINT suggestions_response_id_fkey FOREIGN KEY (response_id) REFERENCES public.responses(id),
  CONSTRAINT suggestions_turn_id_fkey FOREIGN KEY (turn_id) REFERENCES public.turns(id)
);

CREATE TABLE public.turns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL,
  org_id uuid NOT NULL,
  speaker text NOT NULL CHECK (speaker = ANY (ARRAY['agent'::text, 'lead'::text])),
  text text NOT NULL,
  start_ms integer NOT NULL,
  end_ms integer NOT NULL,
  confidence numeric,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT turns_pkey PRIMARY KEY (id),
  CONSTRAINT turns_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.calls(id),
  CONSTRAINT turns_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id)
);

CREATE TABLE public.users (
  id uuid NOT NULL,
  email text NOT NULL UNIQUE,
  full_name text,
  avatar_url text,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);

---

## Key Components
- **Browser Extension**
  - Captures audio from dialer tab (`chrome.tabCapture`)  
  - Sends audio to backend via WebSocket  
  - Displays floating popup with suggestions  

- **Backend (Node.js + Fastify/Express)**
  - Manages audio streaming to Deepgram Nova-2  
  - Handles diarization + segmentation into turns  
  - Runs intent classification + vector search  
  - Returns top suggestion or “No close matches”  

- **Admin Pipeline**
  - Bulk upload call recordings  
  - Transcription + segmentation  
  - Human review/approval of lead+response pairs  
  - Embedding + insertion into Supabase vector DB  

- **Database**
  - Supabase Postgres + pgvector extension  
  - Stores users, calls, utterances, intents, responses, embeddings  

---

## API Endpoints
- `POST /api/stream/start` → Start audio stream for live call  
- `POST /api/stream/stop` → Stop audio stream  
- `WS /api/stream/audio` → Receive audio frames, send back live transcription + suggestions  
- `POST /api/calls/upload` → Upload call recording for offline training  
- `GET /api/suggestions/:callId/:turnId` → Retrieve stored suggestions  

---

## Business Logic
- Only show suggestions when **lead is speaking**.  
- Segment turns at ~200–300 ms silence.  
- Always embed **entire lead turn** (max ~128 tokens).  
- Use OpenAI `text-embedding-3-large` for embeddings.  
- Similarity thresholds:  
  - Default 0.80  
  - ≥0.88 → early display  
  - Below 0.80 → show “No close matches”  
- Limit popup stack to **2 cards** max.  
- Agents auto-login via Supabase Auth.  
- Admin can view analytics: suggestion hit rate, ignored rate, no-match rate.  
