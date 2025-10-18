import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import pkg from 'pg';
const { Pool } = pkg;

const app = express();
const upload = multer({ limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB limit

// Initialize direct Postgres connection (bypasses RLS)
const pgPool = new Pool({
  connectionString: process.env.PG_DSN
});

// Initialize Supabase client with service role (for auth only)
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    db: {
      schema: 'public'
    },
    global: {
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_KEY!
      }
    }
  }
);

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
  credentials: true
}));

app.use(express.json());

// Simple health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Transcribe endpoint
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    console.log('Transcribe request received');
    console.log('Headers:', req.headers);
    
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    console.log('File received:', req.file.originalname, req.file.size, 'bytes');

    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramApiKey) {
      return res.status(500).json({ error: 'Deepgram API key not configured' });
    }

    // Call Deepgram API
    const response = await fetch('https://api.deepgram.com/v1/listen?diarize=true&model=nova-2&punctuate=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramApiKey}`,
        'Content-Type': req.file.mimetype || 'audio/wav'
      },
      body: req.file.buffer
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Deepgram error:', error);
      return res.status(response.status).json({ error: 'Deepgram API error', details: error });
    }

    const result = await response.json();
    
    // Mock turns processing
    const turns = [];
    const words = result.results?.channels?.[0]?.alternatives?.[0]?.words || [];
    
    let currentTurn = null;
    let turnId = 0;
    
    for (const word of words) {
      const speaker = word.speaker === 0 ? 'agent' : 'lead';
      
      if (!currentTurn || currentTurn.speaker !== speaker) {
        if (currentTurn) {
          turns.push(currentTurn);
        }
        currentTurn = {
          id: `turn-${turnId++}`,
          speaker,
          text: word.punctuated_word || word.word,
          start_ms: Math.floor(word.start * 1000),
          end_ms: Math.floor(word.end * 1000)
        };
      } else {
        currentTurn.text += ' ' + (word.punctuated_word || word.word);
        currentTurn.end_ms = Math.floor(word.end * 1000);
      }
    }
    
    if (currentTurn) {
      turns.push(currentTurn);
    }

    console.log(`Transcription complete: ${turns.length} turns found`);

    // Get authenticated user and org from request
    const authHeader = req.headers.authorization;
    console.log('Auth header:', authHeader ? 'Present' : 'Missing');
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    // Get user from auth token
    const token = authHeader.replace('Bearer ', '');
    console.log('Token (first 20 chars):', token.substring(0, 20));
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    console.log('Auth result:', { user: user?.id, error: authError });
    if (authError || !user) {
      console.error('Auth failed:', authError);
      return res.status(401).json({ error: 'Invalid auth token', details: authError?.message });
    }

    // For now, use the default organization ID (from CLAUDE.md)
    const orgId = '00000000-0000-0000-0000-000000000001';
    console.log('Using default organization:', orgId);

    // Create call record using direct Postgres connection
    const callQuery = `
      INSERT INTO calls (org_id, agent_id, duration_seconds, status, started_at, ended_at, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const callValues = [
      orgId,
      user.id,
      Math.floor(result.metadata?.duration || 0),
      'completed',
      new Date().toISOString(),
      new Date().toISOString(),
      JSON.stringify({ 
        filename: req.file.originalname,
        transcript: result.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
      })
    ];

    let call;
    try {
      const callResult = await pgPool.query(callQuery, callValues);
      call = callResult.rows[0];
      console.log('Created call:', call.id);
    } catch (error) {
      console.error('Error creating call:', error);
      return res.status(500).json({ error: 'Failed to save call', details: error.message });
    }

    // Save turns to database using direct Postgres connection
    if (turns.length > 0) {
      const turnsQuery = `
        INSERT INTO turns (call_id, org_id, speaker, text, start_ms, end_ms, confidence, metadata)
        VALUES ${turns.map((_, i) => `($${i * 8 + 1}, $${i * 8 + 2}, $${i * 8 + 3}, $${i * 8 + 4}, $${i * 8 + 5}, $${i * 8 + 6}, $${i * 8 + 7}, $${i * 8 + 8})`).join(', ')}
      `;
      
      const turnsValues = turns.flatMap(turn => [
        call.id,
        orgId,
        turn.speaker,
        turn.text,
        turn.start_ms,
        turn.end_ms,
        0.95, // Mock confidence
        JSON.stringify({})
      ]);

      try {
        await pgPool.query(turnsQuery, turnsValues);
        console.log(`Saved ${turns.length} turns to database`);
      } catch (error) {
        console.error('Error saving turns:', error);
        // Don't fail the whole request if turns fail to save
      }
    }

    res.json({
      success: true,
      callId: call.id,
      transcript: result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '',
      turns,
      duration_seconds: result.metadata?.duration || 0
    });

  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: 'Transcription failed', details: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Simple backend server running on port ${PORT}`);
});