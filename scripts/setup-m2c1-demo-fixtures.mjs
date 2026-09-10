import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local if present
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (let line of content.split('\n')) {
      line = line.replace(/\r/g, '').trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx > 0) {
        const key = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 1).trim();
        process.env[key] = val;
      }
    }
  }
}

loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is required for local setup script.');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function getOrCreateUser(email, password) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!error && data?.user) {
    console.log(`Created user ${email} (${data.user.id})`);
    return data.user.id;
  }

  const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (!listError && usersData?.users) {
    const existing = usersData.users.find((u) => u.email === email);
    if (existing) {
      console.log(`User ${email} already exists (${existing.id})`);
      return existing.id;
    }
  }

  throw new Error(`Failed to create user ${email}: ${error?.message || 'Unknown error'}`);
}

async function setupM2C1DemoFixtures() {
  console.log('=== Setting up local test fixtures for M2C.1 ===');

  // 1. Business: Panara
  const businessId = 'a0000000-0000-0000-0000-0000000000ff';
  const targetDate = '2026-09-09';

  const { data: business, error: bErr } = await supabaseAdmin
    .from('businesses')
    .select('id, name, timezone')
    .eq('id', businessId)
    .single();

  if (bErr || !business) {
    throw new Error(`Business Panara (${businessId}) not found. Run scripts/setup-m1d-demo-fixtures.mjs first.`);
  }

  if (business.timezone !== 'America/Mexico_City') {
    await supabaseAdmin
      .from('businesses')
      .update({ timezone: 'America/Mexico_City' })
      .eq('id', businessId);
    console.log('Updated business timezone to America/Mexico_City');
  }

  // 2. Ensure test owner user
  const ownerUserId = await getOrCreateUser('a@costara.local', 'password123');
  await supabaseAdmin.from('business_members').upsert({
    business_id: businessId,
    user_id: ownerUserId,
    role: 'owner',
  });

  // 3. Fetch base units
  const { data: units, error: uErr } = await supabaseAdmin
    .from('units')
    .select('id, code, dimension_id');

  if (uErr || !units) throw new Error(`Failed to load units: ${uErr?.message}`);

  const unitG = units.find((u) => u.code === 'g')?.id;
  const unitPiece = units.find((u) => u.code === 'piece')?.id;

  if (!unitG || !unitPiece) {
    throw new Error('Required base units (g, piece) not found.');
  }

  // 4. Create or update Production Plan for 2026-09-09
  const planId = 'c0000000-0000-0000-0000-000000000001';
  const planName = '[DEMO M2C.1] Producción 09/09/2026';

  const { error: planErr } = await supabaseAdmin
    .from('production_plans')
    .upsert({
      id: planId,
      business_id: businessId,
      name: planName,
      start_date: targetDate,
      end_date: targetDate,
      notes: 'Plan operacional para prueba manual de flujo UI M2C.1',
    });

  if (planErr) {
    throw new Error(`Failed to upsert production plan: ${planErr.message}`);
  }
  console.log(`Production plan "${planName}" upserted (${planId}).`);

  // 5. TARGET A: Masa Madre Activa (Continuous Mass output, supports target splitting)
  const targetAId = 'ca000000-0000-0000-0000-000000000001';
  const targetBId = 'cb000000-0000-0000-0000-000000000001';

  const itemSourdoughId = 'd1000000-0000-0000-0000-000000000005';
  const versionSourdoughId = 'f1000000-0000-0000-0000-000000000001'; // v1 active as of 2026-09-09

  const { data: existingTargetA } = await supabaseAdmin
    .from('production_targets')
    .select('id')
    .eq('id', targetAId)
    .maybeSingle();

  if (!existingTargetA) {
    const { error: tAErr } = await supabaseAdmin.from('production_targets').insert({
      id: targetAId,
      business_id: businessId,
      production_plan_id: planId,
      target_date: targetDate,
      item_id: itemSourdoughId,
      recipe_version_id: versionSourdoughId,
      target_quantity: '2000.000000000000', // 2000 g (2 kg continuous mass)
      unit_id: unitG,
      position: 1,
      notes: null,
    });
    if (tAErr) throw new Error(`Failed to insert TARGET A: ${tAErr.message}`);
    console.log(`TARGET A (Masa Madre Activa - 2000 g) created (${targetAId}).`);
  } else {
    console.log(`TARGET A (${targetAId}) already exists.`);
  }

  // 6. TARGET B: Pan de Deus con Crema de Limón (Golden Case, Discrete Count/Pieces output)
  const itemPanDeDeusId = 'd3000000-0000-0000-0000-000000000031';
  const versionPanDeDeusId = 'f9000000-0000-0000-0000-000000000004'; // Golden active version

  const { error: tBErr } = await supabaseAdmin.from('production_targets').upsert({
    id: targetBId,
    business_id: businessId,
    production_plan_id: planId,
    target_date: targetDate,
    item_id: itemPanDeDeusId,
    recipe_version_id: versionPanDeDeusId,
    target_quantity: '8.000000000000', // 8 pieces discrete
    unit_id: unitPiece,
    position: 2,
    notes: null,
  });
  if (tBErr) throw new Error(`Failed to upsert TARGET B: ${tBErr.message}`);
  console.log(`TARGET B (Pan de Deus con Crema de Limón - 8 piezas) configured (${targetBId}).`);

  console.log('\n=== M2C.1 Demo Fixtures Ready ===');
  console.log(`Business: Panara (${businessId})`);
  console.log(`Timezone: America/Mexico_City`);
  console.log(`Date: ${targetDate}`);
  console.log(`Plan: "${planName}"`);
  console.log(`  - Target A: Masa Madre Activa, 2000 g (receta v1 activa)`);
  console.log(`  - Target B: Pan de Deus con Crema de Limón, 8 piezas (receta Golden v1 activa)`);
  console.log(`Login: a@costara.local / password123`);
}

setupM2C1DemoFixtures().catch((err) => {
  console.error('Fixture setup failed:', err);
  process.exit(1);
});
