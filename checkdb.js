const fs = require('fs');

async function main() {
    require('dotenv').config({ path: 'c:/Users/angel/OneDrive/Escritorio/MealfitRD.IA/frontend/.env.local' });
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!url || !key) {
        console.log("No env"); return;
    }
    
    const res = await fetch(`${url}/rest/v1/user_inventory?user_id=eq.f3b6214e-8efe-4e1d-bf31-d3e45d3de745`, {
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    });
    const data = await res.json();
    console.log(data.map(d => ({ name: d.ingredient_name, master: d.master_ingredients?.name, qty: d.quantity })));
}
main();
