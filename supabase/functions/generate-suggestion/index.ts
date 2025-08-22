import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { Configuration, OpenAIApi } from 'https://esm.sh/openai@3.3.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { text, orgId, callId, turnId } = await req.json()
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const configuration = new Configuration({
      apiKey: Deno.env.get('OPENAI_API_KEY'),
    })
    const openai = new OpenAIApi(configuration)

    // Generate embedding for the text
    const embeddingResponse = await openai.createEmbedding({
      model: 'text-embedding-3-small',
      input: text,
    })
    const embedding = embeddingResponse.data.data[0].embedding

    // Classify intent (simplified - in production, use a proper classifier)
    const intentResponse = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'Classify the following sales call text into one of these intents: objection, pricing_question, competitor_mention, interest_signal, scheduling, other. Respond with just the intent name.'
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0.3,
      max_tokens: 10
    })
    
    const intentLabel = intentResponse.data.choices[0].message.content.trim()
    
    // Get intent from database
    const { data: intent } = await supabaseClient
      .from('intents')
      .select('*')
      .eq('org_id', orgId)
      .eq('label', intentLabel)
      .single()

    if (!intent) {
      return new Response(
        JSON.stringify({ decision: 'no_match', reason: 'Intent not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Search for similar responses using pgvector
    const { data: matches } = await supabaseClient.rpc('search_responses', {
      query_vec: embedding,
      query_intent_id: intent.id,
      query_org_id: orgId,
      limit_count: 5
    })

    if (!matches || matches.length === 0 || matches[0].similarity < intent.threshold) {
      // No good match - add to review queue
      await supabaseClient
        .from('review_queue')
        .insert({
          org_id: orgId,
          call_id: callId,
          turn_id: turnId,
          lead_text: text,
          proposed_intent_id: intent.id,
          proposed_response: 'No matching response found',
          confidence: matches?.[0]?.similarity || 0
        })

      return new Response(
        JSON.stringify({ 
          decision: 'no_match',
          leadText: text,
          reason: 'Below threshold'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Found a good match
    const bestMatch = matches[0]
    
    // Record the suggestion
    await supabaseClient
      .from('suggestions')
      .insert({
        org_id: orgId,
        call_id: callId,
        turn_id: turnId,
        intent_id: intent.id,
        response_id: bestMatch.response_id,
        lead_text: text,
        suggested_text: bestMatch.response_text,
        similarity_score: bestMatch.similarity,
        decision: 'suggestion'
      })

    return new Response(
      JSON.stringify({
        decision: 'suggestion',
        leadText: text,
        intent: {
          label: intent.label,
          score: bestMatch.similarity
        },
        response: {
          text: bestMatch.response_text,
          id: bestMatch.response_id
        },
        similarity: bestMatch.similarity
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})