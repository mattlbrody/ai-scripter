#!/usr/bin/env node

/**
 * Database Setup Script
 * This script creates all necessary tables in Supabase if they don't exist
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../admin-ui/.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('Missing VITE_SUPABASE_URL in environment variables');
  process.exit(1);
}

if (!supabaseServiceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY. You need to add this to your .env file.');
  console.log('Get it from: https://supabase.com/dashboard/project/lqsbxkgtkmroqenbmzrt/settings/api');
  console.log('Look for the "service_role" key (starts with eyJ...)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupDatabase() {
  console.log('Setting up database tables...');
  
  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, '../database/001_init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      // If exec_sql doesn't exist, try running the commands individually
      console.log('Direct SQL execution not available, checking tables individually...');
      
      // Check if tables exist
      const { data: tables } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'app');
      
      if (!tables || tables.length === 0) {
        console.error('App schema not found. Please run the SQL script manually in Supabase SQL Editor:');
        console.log('1. Go to: https://supabase.com/dashboard/project/lqsbxkgtkmroqenbmzrt/sql/new');
        console.log('2. Copy the contents of database/001_init.sql');
        console.log('3. Paste and run the query');
        return;
      }
      
      console.log('Found tables:', tables.map(t => t.table_name).join(', '));
    } else {
      console.log('Database setup completed successfully!');
    }
    
    // Create a test organization if none exists
    const { data: orgs } = await supabase
      .schema('app')
      .from('organizations')
      .select('id')
      .limit(1);
    
    if (!orgs || orgs.length === 0) {
      console.log('Creating test organization...');
      const { data: org, error: orgError } = await supabase
        .schema('app')
        .from('organizations')
        .insert({ name: 'Test Organization' })
        .select()
        .single();
      
      if (orgError) {
        console.error('Error creating organization:', orgError);
      } else {
        console.log('Created organization:', org.id);
        
        // Create default intents
        const intents = [
          { label: 'objection', description: 'Customer expressing doubt or resistance', threshold: 0.80 },
          { label: 'pricing_question', description: 'Questions about cost or pricing', threshold: 0.82 },
          { label: 'competitor_mention', description: 'Mentioning or comparing to competitors', threshold: 0.78 },
          { label: 'interest_signal', description: 'Showing interest or asking for more info', threshold: 0.85 },
          { label: 'scheduling', description: 'Discussing times or scheduling meetings', threshold: 0.83 }
        ];
        
        for (const intent of intents) {
          const { error } = await supabase
            .schema('app')
            .from('intents')
            .insert({ ...intent, org_id: org.id });
          
          if (error) {
            console.error(`Error creating intent ${intent.label}:`, error);
          }
        }
        
        console.log('Created default intents');
      }
    }
    
    // Check if storage bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const callsBucket = buckets?.find(b => b.name === 'calls');
    
    if (!callsBucket) {
      console.log('Creating storage bucket for calls...');
      const { error } = await supabase.storage.createBucket('calls', {
        public: false,
        fileSizeLimit: 104857600 // 100MB
      });
      
      if (error) {
        console.error('Error creating bucket:', error);
      } else {
        console.log('Created calls storage bucket');
      }
    }
    
    console.log('\nSetup complete! Next steps:');
    console.log('1. Deploy edge functions (if not done):');
    console.log('   npx supabase functions deploy --project-ref lqsbxkgtkmroqenbmzrt');
    console.log('2. Set edge function secrets:');
    console.log('   npx supabase secrets set DEEPGRAM_API_KEY=your_key');
    console.log('   npx supabase secrets set OPENAI_API_KEY=your_key');
    console.log('3. Run the admin UI:');
    console.log('   npm run dev:admin');
    
  } catch (error) {
    console.error('Error setting up database:', error);
  }
}

setupDatabase();