import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { audio, callId, orgId } = await req.json()
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Process audio with Deepgram
    const deepgramResponse = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&diarize=true&punctuate=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${Deno.env.get('DEEPGRAM_API_KEY')}`,
        'Content-Type': 'audio/wav'
      },
      body: audio
    })

    const transcript = await deepgramResponse.json()
    
    // Parse transcript and extract turns
    const turns = transcript.results.channels[0].alternatives[0].words.reduce((acc: any[], word: any) => {
      const speaker = word.speaker || 0
      const lastTurn = acc[acc.length - 1]
      
      if (!lastTurn || lastTurn.speaker !== speaker) {
        acc.push({
          speaker: speaker === 0 ? 'agent' : 'lead',
          text: word.word,
          start: word.start * 1000,
          end: word.end * 1000
        })
      } else {
        lastTurn.text += ' ' + word.word
        lastTurn.end = word.end * 1000
      }
      
      return acc
    }, [])

    // Save turns to database
    for (const turn of turns) {
      await supabaseClient
        .from('turns')
        .insert({
          call_id: callId,
          org_id: orgId,
          speaker: turn.speaker,
          text: turn.text,
          start_ms: turn.start,
          end_ms: turn.end,
          confidence: 0.95
        })
    }

    // Process lead turns for suggestions
    const leadTurns = turns.filter(t => t.speaker === 'lead')
    for (const turn of leadTurns) {
      // Call suggestion generator function
      await supabaseClient.functions.invoke('generate-suggestion', {
        body: { 
          text: turn.text,
          orgId,
          callId,
          turnId: turn.id
        }
      })
    }

    return new Response(
      JSON.stringify({ success: true, turns: turns.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})