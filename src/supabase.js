import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ocwqlnkyabiqygouwelu.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jd3Fsbmt5YWJpcXlnb3V3ZWx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNzAzMTcsImV4cCI6MjA4OTk0NjMxN30.KescTjOBAa8q7PG-tGtkKAFKW0STrcxVZ4HUoGObSMg'

export const supabase = createClient(supabaseUrl, supabaseKey)
