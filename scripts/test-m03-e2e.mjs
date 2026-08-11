import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!publishableKey) {
  console.error('ERROR: VITE_SUPABASE_PUBLISHABLE_KEY is required for E2E tests.');
  process.exit(1);
}

// Client instantiated ONLY with publishable key (NO service_role!)
const client = createClient(supabaseUrl, publishableKey);

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`PASS: ${message}`);
}

async function runE2ETests() {
  console.log('Starting End-to-End Multi-Tenant Isolation Verification...');

  // --- TEST USER A ---
  console.log('\n--- 1. Authenticating as User A (a@costara.local) ---');
  const { data: authA, error: errAuthA } = await client.auth.signInWithPassword({
    email: 'a@costara.local',
    password: 'password123',
  });
  assert(!errAuthA && authA.user, 'User A sign in successful');
  assert(authA.user.email === 'a@costara.local', 'Authenticated user is a@costara.local');

  // Query business memberships for User A
  const { data: membersA, error: errMemA } = await client
    .from('business_members')
    .select('role, business:businesses(id, name)');
  assert(!errMemA && membersA.length === 1, 'User A belongs to exactly 1 business');
  assert(membersA[0].business.name === 'Panara', 'User A business is Panara');

  // Query items as User A
  const { data: itemsA, error: errItemsA } = await client.from('items').select('id, name');
  assert(!errItemsA, 'User A queried items without error');
  const itemNamesA = itemsA.map((i) => i.name).sort();
  assert(
    JSON.stringify(itemNamesA) === JSON.stringify(['Harina Panara', 'Huevo Panara']),
    `User A sees only their items (found: ${itemNamesA.join(', ')})`
  );

  // Cross-tenant attempt: User A querying Business B's items directly
  const { data: crossItemsA } = await client
    .from('items')
    .select('id, name')
    .eq('business_id', 'b0000000-0000-0000-0000-0000000000fe');
  assert(crossItemsA && crossItemsA.length === 0, 'User A cannot access items of Business B (returns 0 items)');

  // Sign out User A
  await client.auth.signOut();

  // --- TEST USER B ---
  console.log('\n--- 2. Authenticating as User B (b@costara.local) ---');
  const { data: authB, error: errAuthB } = await client.auth.signInWithPassword({
    email: 'b@costara.local',
    password: 'password123',
  });
  assert(!errAuthB && authB.user, 'User B sign in successful');
  assert(authB.user.email === 'b@costara.local', 'Authenticated user is b@costara.local');

  // Query business memberships for User B
  const { data: membersB, error: errMemB } = await client
    .from('business_members')
    .select('role, business:businesses(id, name)');
  assert(!errMemB && membersB.length === 1, 'User B belongs to exactly 1 business');
  assert(membersB[0].business.name === 'Demo Bakery B', 'User B business is Demo Bakery B');

  // Query items as User B
  const { data: itemsB, error: errItemsB } = await client.from('items').select('id, name');
  assert(!errItemsB, 'User B queried items without error');
  const itemNamesB = itemsB.map((i) => i.name).sort();
  assert(
    JSON.stringify(itemNamesB) === JSON.stringify(['Chocolate B', 'Harina B']),
    `User B sees only their items (found: ${itemNamesB.join(', ')})`
  );

  // Cross-tenant attempt: User B querying Business A's items directly
  const { data: crossItemsB } = await client
    .from('items')
    .select('id, name')
    .eq('business_id', 'a0000000-0000-0000-0000-0000000000ff');
  assert(crossItemsB && crossItemsB.length === 0, 'User B cannot access items of Business A (returns 0 items)');

  // Sign out User B
  await client.auth.signOut();

  // --- TEST UNAUTHENTICATED ---
  console.log('\n--- 3. Testing Unauthenticated Access ---');
  const { data: unauthItems } = await client.from('items').select('id, name');
  assert(unauthItems && unauthItems.length === 0, 'Unauthenticated request returns 0 items');

  console.log('\nAll End-to-End Multi-Tenant Isolation Verifications PASSED successfully!');
}

runE2ETests().catch((err) => {
  console.error('\nE2E Verification FAILED:', err);
  process.exit(1);
});
