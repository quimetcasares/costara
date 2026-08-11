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

  // If user already exists or list is needed
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

async function waitForServicesReady() {
  const healthUrl = `${supabaseUrl}/auth/v1/health`;
  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) {
        return;
      }
    } catch {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function setupFixtures() {
  console.log('Setting up local test fixtures for M0.3...');
  await waitForServicesReady();

  // 1. Create local test users
  const userAId = await getOrCreateUser('a@costara.local', 'password123');
  const userBId = await getOrCreateUser('b@costara.local', 'password123');

  // 2. Fetch base units (g and piece)
  const { data: units, error: unitsErr } = await supabaseAdmin.from('units').select('id, code');
  if (unitsErr) throw new Error(`Failed to fetch units: ${unitsErr.message}`);

  const unitG = units.find((u) => u.code === 'g')?.id;
  const unitPiece = units.find((u) => u.code === 'piece')?.id;

  if (!unitG || !unitPiece) {
    throw new Error('Required base units (g, piece) not found in units table. Run migrations first.');
  }

  // 3. Create Businesses
  const businessAId = 'a0000000-0000-0000-0000-0000000000ff';
  const businessBId = 'b0000000-0000-0000-0000-0000000000fe';

  const { error: bizAErr } = await supabaseAdmin.from('businesses').upsert({
    id: businessAId,
    name: 'Panara',
    currency_code: 'MXN',
  });
  if (bizAErr) throw new Error(`Failed to create Business A: ${bizAErr.message}`);

  const { error: bizBErr } = await supabaseAdmin.from('businesses').upsert({
    id: businessBId,
    name: 'Demo Bakery B',
    currency_code: 'MXN',
  });
  if (bizBErr) throw new Error(`Failed to create Business B: ${bizBErr.message}`);

  // 4. Create Business Memberships
  const { error: memAErr } = await supabaseAdmin.from('business_members').upsert({
    business_id: businessAId,
    user_id: userAId,
    role: 'owner',
  });
  if (memAErr) throw new Error(`Failed to create Membership A: ${memAErr.message}`);

  const { error: memBErr } = await supabaseAdmin.from('business_members').upsert({
    business_id: businessBId,
    user_id: userBId,
    role: 'owner',
  });
  if (memBErr) throw new Error(`Failed to create Membership B: ${memBErr.message}`);

  // 5. Create Items
  const itemsA = [
    {
      id: 'a0000000-0000-0000-0000-0000000000f1',
      business_id: businessAId,
      name: 'Harina Panara',
      kind: 'raw_material',
      base_unit_id: unitG,
      purchasable: true,
    },
    {
      id: 'a0000000-0000-0000-0000-0000000000f2',
      business_id: businessAId,
      name: 'Huevo Panara',
      kind: 'raw_material',
      base_unit_id: unitPiece,
      purchasable: true,
    },
  ];

  const itemsB = [
    {
      id: 'b0000000-0000-0000-0000-0000000000f3',
      business_id: businessBId,
      name: 'Harina B',
      kind: 'raw_material',
      base_unit_id: unitG,
      purchasable: true,
    },
    {
      id: 'b0000000-0000-0000-0000-0000000000f4',
      business_id: businessBId,
      name: 'Chocolate B',
      kind: 'raw_material',
      base_unit_id: unitG,
      purchasable: true,
    },
  ];

  const { error: itemsAErr } = await supabaseAdmin.from('items').upsert(itemsA);
  if (itemsAErr) throw new Error(`Failed to insert Items A: ${itemsAErr.message}`);

  const { error: itemsBErr } = await supabaseAdmin.from('items').upsert(itemsB);
  if (itemsBErr) throw new Error(`Failed to insert Items B: ${itemsBErr.message}`);

  console.log('Local test fixtures for M0.3 created successfully!');
}

async function runWithRetry() {
  let attempts = 0;
  const maxAttempts = 5;
  while (attempts < maxAttempts) {
    attempts++;
    try {
      await setupFixtures();
      return;
    } catch (err) {
      if (attempts >= maxAttempts) {
        throw err;
      }
      console.warn(`Attempt ${attempts} failed (${err.message}). Retrying in 1s...`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

runWithRetry().catch((err) => {
  console.error('Fixture setup failed:', err);
  process.exit(1);
});
