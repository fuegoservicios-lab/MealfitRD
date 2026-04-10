const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://mpoodlmnzaeuuazsazbj.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wb29kbG1uemFldXVhenNhemJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNjg2MDUsImV4cCI6MjA4MzY0NDYwNX0.V1GlhSOCnzR-dxl2ArzkF_s_3uGUSbjwddvbLzbT-w0');

async function run() { 
    const { data } = await supabase.from('meal_plans').select('*').order('created_at', { ascending: false }).limit(1); 
    console.log(JSON.stringify(data[0]?.plan_data?.days, null, 2)); 
} 
run();
