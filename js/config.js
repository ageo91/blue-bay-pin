// Leaderboard backend (Supabase). Leave empty to run the game without a leaderboard.
// supabaseKey is the project's public "anon" / publishable key: it is meant to ship in the page, and the
// database rules in supabase/leaderboard.sql decide what it can do. Never put the service_role / secret key here.
window.BB_CONFIG={
  supabaseUrl:'',
  supabaseKey:''
};
