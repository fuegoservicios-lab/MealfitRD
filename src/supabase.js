
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mpoodlmnzaeuuazsazbj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wb29kbG1uemFldXVhenNhemJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNjg2MDUsImV4cCI6MjA4MzY0NDYwNX0.V1GlhSOCnzR-dxl2ArzkF_s_3uGUSbjwddvbLzbT-w0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
