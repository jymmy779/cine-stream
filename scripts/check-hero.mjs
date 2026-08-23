import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('./.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL="?([^"\r\n]+)"?/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY="?([^"\r\n]+)"?/);

const supabase = createClient(urlMatch[1], keyMatch[1]);

async function check() {
  const { data: starred } = await supabase.from('starred_movies').select('*');
  console.log('--- STARRED MOVIES ---');
  console.log(JSON.stringify(starred, null, 2));

  const { data: exclusive } = await supabase.from('exclusive_movies').select('*');
  console.log('\n--- EXCLUSIVE MOVIES ---');
  console.log('Count:', exclusive ? exclusive.length : 0);
  if (exclusive && exclusive.length > 0) {
    console.log(exclusive.map(e => ({ name: e.name, slug: e.slug, created_at: e.created_at })));
  }
}

check().catch(console.error);
