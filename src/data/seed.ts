import { emptyPool } from '../domain/pricePool';
import type {
  Admin,
  Artisan,
  ArtisanAccountType,
  ChatMessage,
  Customer,
  IdentityVerification,
  Job,
  Review,
  ServiceItem,
  SkillVerification,
  TrustStats,
  Worker,
} from '../domain/types';

/**
 * Demo dataset. In production this comes from the Sleek API; the shapes are
 * identical so swapping the data source does not touch the UI.
 */

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

const verifiedId = (name: string, score = 0.94): IdentityVerification => ({
  nin: 'passed',
  ninLast4: String(1000 + Math.floor(score * 8999)).slice(-4),
  liveness: 'passed',
  faceMatch: 'passed',
  faceMatchScore: score,
  verifiedAt: iso(Date.now() - 120 * DAY),
  fullNameOnRecord: name,
});

const skill = (categoryId: string, status: SkillVerification['status'] = 'approved', qualityScore = 4.4): SkillVerification => ({
  categoryId,
  status,
  qualityScore: status === 'approved' ? qualityScore : undefined,
  submittedAt: iso(Date.now() - 100 * DAY),
  decidedAt: status === 'approved' ? iso(Date.now() - 98 * DAY) : undefined,
});

const stats = (completed: number, avg: number, extra: Partial<TrustStats> = {}): TrustStats => ({
  completedJobs: completed,
  cancelledByArtisan: 0,
  disputesOpened: 0,
  disputesLost: 0,
  ruleViolations: 0,
  ratingSum: Math.round(avg * Math.max(1, Math.round(completed * 0.8)) * 10) / 10,
  ratingCount: Math.max(completed ? 1 : 0, Math.round(completed * 0.8)),
  onTimeRate: 0.95,
  ...extra,
});

const weekHours = (start = 8, end = 18, sunday = false): Artisan['workingHours'] => ({
  0: sunday ? { start: 12, end: 18 } : null,
  1: { start, end },
  2: { start, end },
  3: { start, end },
  4: { start, end },
  5: { start, end },
  6: { start: Math.max(start, 9), end: Math.min(end, 16) },
});

const COLORS = ['#0EA5E9', '#0B3D91', '#0284C7', '#1E40AF', '#0369A1', '#2563EB', '#0F766E', '#7C3AED', '#B45309', '#BE185D'];

let phoneSeq = 10;
function artisan(
  id: string,
  name: string,
  area: string,
  city: string,
  skills: SkillVerification[],
  prices: Record<string, number>,
  s: TrustStats,
  opts: {
    accountType?: ArtisanAccountType;
    businessName?: string;
    bio?: string;
    years?: number;
    online?: boolean;
    workers?: Worker[];
    hours?: Artisan['workingHours'];
    faceScore?: number;
  } = {},
): Artisan {
  return {
    id,
    role: 'artisan',
    accountType: opts.accountType ?? 'individual',
    businessName: opts.businessName,
    name,
    phone: id === DEMO_ARTISAN_ID ? '+2348000000000' : `+23480${String(phoneSeq++).padStart(8, '0')}`,
    bio: opts.bio ?? `Experienced professional serving ${area} and nearby areas. Neat work, on time, and I explain everything before I start.`,
    area,
    city,
    yearsExperience: opts.years ?? 5,
    online: opts.online ?? true,
    identity: verifiedId(name, opts.faceScore),
    skills,
    startingPrices: prices,
    stats: s,
    workers: opts.workers ?? [],
    calendarMode: opts.accountType && opts.accountType !== 'individual' ? 'shared' : undefined,
    workingHours: opts.hours ?? weekHours(),
    joinedAt: iso(Date.now() - 300 * DAY),
    avatarColor: COLORS[id.length % COLORS.length],
    payoutAccount: { bankName: 'GTBank', accountNumberLast4: '4417', accountName: name, verified: true },
  };
}

const worker = (id: string, name: string, skills: SkillVerification[], color: string): Worker => ({
  id,
  name,
  identity: verifiedId(name, 0.92),
  skills,
  active: true,
  avatarColor: color,
});

export const DEMO_ARTISAN_ID = 'art_tunde';
export const DEMO_TEAM_ID = 'art_brightclean';
export const DEMO_CUSTOMER_ID = 'cus_amaka';
export const DEMO_ADMIN_ID = 'adm_sleek';

export function seedArtisans(): Artisan[] {
  return [
    artisan(DEMO_ARTISAN_ID, 'Tunde Bakare', 'Yaba', 'Lagos', [skill('mechanic', 'approved', 4.7), skill('auto_electrician', 'approved', 4.3), skill('electrician', 'in_review')], { mechanic: 15000, auto_electrician: 18000 }, stats(142, 4.8), {
      bio: 'Toyota & Honda specialist. 11 years in the workshop, now mobile. I come with my own tools and diagnostic scanner.',
      years: 11,
    }),
    artisan('art_chioma', 'Chioma Okafor', 'Lekki Phase 1', 'Lagos', [skill('tailor', 'approved', 4.9), skill('gele', 'approved', 4.6)], { tailor: 25000, gele: 8000 }, stats(210, 4.9), {
      bio: 'Bespoke native and corporate wear. Home measurement visits, fittings, and quick alterations.',
      years: 9,
      hours: weekHours(9, 19, true),
    }),
    artisan('art_emeka', 'Emeka Nwosu', 'Gwarinpa', 'Abuja', [skill('electrician', 'approved', 4.6), skill('solar_installer', 'approved', 4.5)], { electrician: 12000, solar_installer: 85000 }, stats(96, 4.7), {
      bio: 'COREN-registered electrician. House wiring, faults, changeover switches and full solar/inverter installs.',
      years: 8,
    }),
    artisan('art_bisi', 'Bisi Adeyemi', 'Ikeja GRA', 'Lagos', [skill('photographer', 'approved', 4.8), skill('videographer', 'approved', 4.4)], { photographer: 45000, videographer: 80000 }, stats(78, 4.8), {
      bio: 'Portraits, birthdays, owambe and corporate events. Edited photos delivered in 72 hours.',
      years: 6,
      hours: weekHours(7, 22, true),
    }),
    artisan('art_musa', 'Musa Ibrahim', 'Surulere', 'Lagos', [skill('plumber', 'approved', 4.2)], { plumber: 10000 }, stats(54, 4.5, { cancelledByArtisan: 2, onTimeRate: 0.88 }), { years: 7 }),
    artisan('art_grace', 'Grace Effiong', 'GRA Phase 2', 'Port Harcourt', [skill('cleaner', 'approved', 4.6), skill('laundry', 'approved', 4.5)], { cleaner: 15000, laundry: 6000 }, stats(65, 4.7), { years: 4 }),
    artisan('art_kelechi', 'Kelechi Eze', 'Yaba', 'Lagos', [skill('carpenter', 'approved', 4.5), skill('furniture_repair', 'approved', 4.4)], { carpenter: 20000, furniture_repair: 12000 }, stats(88, 4.6), { years: 12 }),
    artisan('art_aisha', 'Aisha Bello', 'Wuse 2', 'Abuja', [skill('makeup', 'approved', 4.8), skill('hair_stylist', 'approved', 4.7)], { makeup: 30000, hair_stylist: 15000 }, stats(132, 4.9), { years: 6, hours: weekHours(6, 20, true) }),
    artisan('art_femi', 'Femi Ogunleye', 'Ajah', 'Lagos', [skill('ac_tech', 'approved', 4.4), skill('fridge_tech', 'approved', 4.2)], { ac_tech: 15000, fridge_tech: 12000 }, stats(41, 4.4), { years: 5 }),
    artisan('art_ngozi', 'Ngozi Umeh', 'Independence Layout', 'Enugu', [skill('tutor', 'approved', 4.7)], { tutor: 20000 }, stats(29, 4.8), { years: 10 }),
    artisan('art_sola', 'Sola Akinwale', 'Magodo', 'Lagos', [skill('mechanic', 'approved', 4.1), skill('vulcanizer', 'approved', 4.0)], { mechanic: 12000, vulcanizer: 3000 }, stats(23, 4.2, { ruleViolations: 1, lastViolationAt: iso(Date.now() - 10 * DAY) }), { years: 3 }),
    artisan('art_ibrahim', 'Ibrahim Sani', 'Nassarawa', 'Kano', [skill('generator_tech', 'approved', 4.5), skill('welder', 'approved', 4.3)], { generator_tech: 8000, welder: 25000 }, stats(70, 4.6), { years: 9 }),
    artisan('art_yemi', 'Yemi Daniels', 'Lekki Phase 1', 'Lagos', [skill('dj', 'approved', 4.6), skill('mc', 'approved', 4.5), skill('sound_engineer', 'approved', 4.4)], { dj: 120000, mc: 100000, sound_engineer: 80000 }, stats(45, 4.7), { years: 7, hours: weekHours(10, 23, true) }),
    artisan('art_offline', 'Peter Obi-Okon', 'Ikoyi', 'Lagos', [skill('painter', 'approved', 4.3)], { painter: 50000 }, stats(30, 4.3), { online: false }),
    artisan(DEMO_TEAM_ID, 'Funmi Alade', 'Ikeja', 'Lagos', [skill('cleaner', 'approved', 4.7), skill('deep_cleaning', 'approved', 4.6), skill('fumigation', 'approved', 4.4)], { cleaner: 18000, deep_cleaning: 60000, fumigation: 35000 }, stats(320, 4.8), {
      accountType: 'team',
      businessName: 'BrightClean Team',
      bio: 'A verified team of 4 cleaners. Homes, offices and post-construction deep cleans. We bring all equipment.',
      years: 6,
      workers: [
        worker('wk_bc_1', 'Funmi Alade', [skill('cleaner'), skill('deep_cleaning')], '#0EA5E9'),
        worker('wk_bc_2', 'Joy Nnamdi', [skill('cleaner'), skill('fumigation')], '#0B3D91'),
        worker('wk_bc_3', 'Tobi Lawal', [skill('cleaner'), skill('deep_cleaning')], '#0284C7'),
        worker('wk_bc_4', 'Hauwa Musa', [skill('cleaner', 'in_review')], '#7C3AED'),
      ],
    }),
    artisan('art_buildpro', 'Olumide Coker', 'Victoria Island', 'Lagos', [skill('electrician', 'approved', 4.6), skill('plumber', 'approved', 4.5), skill('painter', 'approved', 4.5), skill('tiler', 'approved', 4.6), skill('pop_ceiling', 'approved', 4.4)], { electrician: 15000, plumber: 12000, painter: 60000, tiler: 80000, pop_ceiling: 120000 }, stats(512, 4.7), {
      accountType: 'agency',
      businessName: 'BuildPro Services',
      bio: 'Facility & renovation agency with verified electricians, plumbers, painters and tilers. Same-day dispatch across Lagos.',
      years: 14,
      workers: [
        worker('wk_bp_1', 'Chinedu Obi', [skill('electrician'), skill('solar_installer')], '#0B3D91'),
        worker('wk_bp_2', 'Yusuf Adamu', [skill('plumber')], '#0EA5E9'),
        worker('wk_bp_3', 'Segun Martins', [skill('painter'), skill('pop_ceiling')], '#B45309'),
        worker('wk_bp_4', 'Kunle Ade', [skill('tiler'), skill('mason')], '#0F766E'),
        worker('wk_bp_5', 'Ebuka Mba', [skill('electrician')], '#1E40AF'),
      ],
    }),
  ];
}

export function seedCustomers(): Customer[] {
  return [
    {
      id: DEMO_CUSTOMER_ID,
      role: 'customer',
      name: 'Amaka Johnson',
      phone: '+2348000000001',
      area: 'Yaba',
      city: 'Lagos',
      joinedAt: iso(Date.now() - 60 * DAY),
      addresses: [
        { label: 'Home', line1: '14 Alagomeji Street', area: 'Yaba', city: 'Lagos', state: 'Lagos', landmark: 'Opposite the pharmacy' },
        { label: 'Office', line1: '3 Herbert Macaulay Way', area: 'Yaba', city: 'Lagos', state: 'Lagos' },
      ],
    },
  ];
}

export const SEED_ADMIN: Admin = { id: DEMO_ADMIN_ID, role: 'admin', name: 'Sleek Trust Team', phone: '+2348000000009' };

const REVIEW_TEXT = [
  'Came on time and explained the problem clearly. Fixed it properly.',
  'Very neat work. I will book again.',
  'Professional and polite. The escrow made me feel safe.',
  'Good job, a little late but kept me informed in the chat.',
  'Excellent! Exactly what I asked for.',
  'Fair price and quality work.',
];
const NAMES = ['Ada O.', 'Kunle A.', 'Zainab M.', 'Ifeoma C.', 'Bola T.', 'Uche N.', 'Halima S.', 'Dayo F.'];

export function seedReviews(artisans: Artisan[]): Review[] {
  const out: Review[] = [];
  artisans.forEach((a, ai) => {
    const approved = a.skills.filter((s) => s.status === 'approved');
    for (let i = 0; i < Math.min(4, a.stats.ratingCount); i++) {
      out.push({
        id: `rev_${a.id}_${i}`,
        jobId: `job_hist_${a.id}_${i}`,
        artisanId: a.id,
        customerName: NAMES[(ai + i) % NAMES.length],
        rating: i === 3 ? 4 : 5,
        comment: REVIEW_TEXT[(ai + i) % REVIEW_TEXT.length],
        categoryId: approved[i % Math.max(1, approved.length)]?.categoryId ?? 'cleaner',
        at: iso(Date.now() - (i + 1) * 9 * DAY),
      });
    }
  });
  return out;
}

/** A couple of in-flight jobs so every screen has something real to show. */
export function seedJobs(customer: Customer): { jobs: Job[]; messages: ChatMessage[] } {
  const now = Date.now();
  const start = new Date(now + 2 * DAY);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 3_600_000);
  const ac: Job = {
    id: 'job_demo_ac',
    customerId: customer.id,
    artisanId: 'art_femi',
    categoryId: 'ac_tech',
    title: 'AC not cooling',
    description: 'Split unit in the bedroom blows warm air. Probably needs gas or servicing.',
    window: { start: start.toISOString(), end: end.toISOString() },
    address: customer.addresses[0],
    size: 'short',
    status: 'requested',
    pricePool: {
      offers: [{ id: 'off_demo_1', by: 'artisan', amount: 18000, at: iso(now - 3_600_000), status: 'pending', note: 'Includes servicing + gas top-up check' }],
    },
    escrow: { state: 'none', amount: 0 },
    issuePhotos: [],
    createdAt: iso(now - 4 * 3_600_000),
    updatedAt: iso(now - 3_600_000),
    timeline: [{ at: iso(now - 4 * 3_600_000), label: 'Request sent to Femi Ogunleye', by: 'customer' }],
    origin: 'app',
  };
  const messages: ChatMessage[] = [
    { id: 'msg_d1', jobId: ac.id, from: 'system', kind: 'system', text: 'Chat is protected by Sleek. Phone numbers, emails and off-app contact are blocked. Your address is shared only after you fund escrow.', at: iso(now - 4 * 3_600_000) },
    { id: 'msg_d2', jobId: ac.id, from: 'customer', kind: 'text', text: 'Good afternoon. My bedroom AC is blowing warm air. Can you come on the date I picked?', at: iso(now - 4 * 3_600_000 + 60_000) },
    { id: 'msg_d3', jobId: ac.id, from: 'artisan', kind: 'text', text: 'Good afternoon ma. Yes I can. It is likely low gas or a dirty coil. I will service it and check the gas.', at: iso(now - 3_700_000) },
    { id: 'msg_d4', jobId: ac.id, from: 'artisan', kind: 'price', text: 'Proposed ₦18,000', at: iso(now - 3_600_000), offerId: 'off_demo_1' },
  ];
  return { jobs: [ac], messages };
}

export function emptyJobDraft(): Pick<Job, 'pricePool' | 'escrow' | 'issuePhotos'> {
  return { pricePool: emptyPool(), escrow: { state: 'none', amount: 0 }, issuePhotos: [] };
}

// ---------------------------------------------------------------------------
// Sleek Services catalogue
// ---------------------------------------------------------------------------

export const SERVICE_ITEMS: ServiceItem[] = [
  // Tools & materials
  { id: 'p_multimeter', kind: 'product', name: 'Digital Multimeter', group: 'Tools', icon: 'speedometer-outline', price: 8500, listPrice: 11000, unit: 'each', description: 'Auto-ranging multimeter for voltage, current and continuity tests.', vendor: 'Alaba Tools Hub', vendorArea: 'Ojo, Lagos', stock: 40, relatedCategoryIds: ['electrician', 'auto_electrician', 'ac_tech'] },
  { id: 'p_cable', kind: 'product', name: '2.5mm Copper Cable (100m)', group: 'Materials', icon: 'git-network-outline', price: 38000, listPrice: 45000, unit: 'roll', description: 'Pure copper single-core cable, SON certified.', vendor: 'Coleman Direct', vendorArea: 'Ikeja, Lagos', stock: 25, relatedCategoryIds: ['electrician'] },
  { id: 'p_paint', kind: 'product', name: 'Emulsion Paint (20L)', group: 'Materials', icon: 'color-palette-outline', price: 32000, listPrice: 36500, unit: 'bucket', description: 'Interior matt emulsion. 40+ colours available.', vendor: 'Dulux Partner Store', vendorArea: 'Lekki, Lagos', stock: 60, relatedCategoryIds: ['painter'] },
  { id: 'p_pipe', kind: 'product', name: 'PVC Pipe & Fittings Kit', group: 'Materials', icon: 'water-outline', price: 14500, listPrice: 17000, unit: 'kit', description: '1/2" and 3/4" pipes, elbows, tees and tape.', vendor: 'PlumbMart', vendorArea: 'Surulere, Lagos', stock: 35, relatedCategoryIds: ['plumber'] },
  { id: 'p_cleaning_kit', kind: 'product', name: 'Pro Cleaning Kit', group: 'Supplies', icon: 'sparkles-outline', price: 12000, listPrice: 15000, unit: 'kit', description: 'Mop, microfibre cloths, disinfectant, degreaser and gloves.', vendor: 'CleanCo Supplies', vendorArea: 'Yaba, Lagos', stock: 80, relatedCategoryIds: ['cleaner', 'deep_cleaning'] },
  { id: 'p_toolbox', kind: 'product', name: '108-piece Mechanic Toolbox', group: 'Tools', icon: 'construct-outline', price: 42000, listPrice: 55000, unit: 'set', description: 'Sockets, spanners, ratchets and screwdrivers in a steel case.', vendor: 'Ladipo Spares', vendorArea: 'Mushin, Lagos', stock: 15, relatedCategoryIds: ['mechanic'] },
  { id: 'p_brake_pads', kind: 'product', name: 'Brake Pads (Toyota Corolla)', group: 'Parts', icon: 'car-outline', price: 16000, listPrice: 19500, unit: 'set', description: 'Front ceramic brake pads, 2009–2018 models.', vendor: 'Ladipo Spares', vendorArea: 'Mushin, Lagos', stock: 30, relatedCategoryIds: ['mechanic'] },
  { id: 'p_fabric', kind: 'product', name: 'Ankara Fabric (6 yards)', group: 'Materials', icon: 'shirt-outline', price: 9000, listPrice: 10500, unit: 'pack', description: 'Premium wax print. Many designs.', vendor: 'Balogun Market Partners', vendorArea: 'Lagos Island', stock: 100, relatedCategoryIds: ['tailor'] },
  { id: 'p_tiles', kind: 'product', name: 'Floor Tiles 60×60 (per m²)', group: 'Materials', icon: 'grid-outline', price: 7800, listPrice: 9000, unit: 'm²', description: 'Polished porcelain tiles.', vendor: 'TileWorld', vendorArea: 'Ajah, Lagos', stock: 500, relatedCategoryIds: ['tiler'] },
  { id: 'p_ac_gas', kind: 'product', name: 'R410A Refrigerant Gas', group: 'Parts', icon: 'snow-outline', price: 28000, listPrice: 32000, unit: 'cylinder', description: '11.3kg cylinder for split AC units.', vendor: 'CoolAir Parts', vendorArea: 'Ikeja, Lagos', stock: 20, relatedCategoryIds: ['ac_tech'] },
  // Rentals
  { id: 'r_car', kind: 'rental', name: 'Toyota Camry with Driver', group: 'Vehicles', icon: 'car-sport-outline', price: 45000, unit: 'day', deposit: 50000, description: 'Clean AC car with a verified driver. Fuel not included.', vendor: 'Sleek Mobility', vendorArea: 'Lagos', stock: 8, relatedCategoryIds: ['driver'] },
  { id: 'r_bus', kind: 'rental', name: '18-seater Bus', group: 'Vehicles', icon: 'bus-outline', price: 85000, unit: 'day', deposit: 80000, description: 'For events and staff movement, with driver.', vendor: 'Sleek Mobility', vendorArea: 'Lagos', stock: 3, relatedCategoryIds: [] },
  { id: 'r_generator', kind: 'rental', name: '20kVA Soundproof Generator', group: 'Power', icon: 'battery-charging-outline', price: 60000, unit: 'day', deposit: 100000, description: 'Diesel generator for events. Delivery & setup included.', vendor: 'PowerHire NG', vendorArea: 'Ikeja, Lagos', stock: 5, relatedCategoryIds: ['generator_tech'] },
  { id: 'r_chairs', kind: 'rental', name: 'Event Chairs (×50)', group: 'Events', icon: 'people-outline', price: 15000, unit: 'day', deposit: 20000, description: 'Plastic chairs with covers, set of 50.', vendor: 'Owambe Rentals', vendorArea: 'Surulere, Lagos', stock: 20, relatedCategoryIds: ['decorator', 'ushers'] },
  { id: 'r_canopy', kind: 'rental', name: 'Canopy / Tent (100 guests)', group: 'Events', icon: 'umbrella-outline', price: 35000, unit: 'day', deposit: 40000, description: 'Includes installation and removal.', vendor: 'Owambe Rentals', vendorArea: 'Surulere, Lagos', stock: 10, relatedCategoryIds: ['decorator'] },
  { id: 'r_stage', kind: 'rental', name: 'Event Stage 8×4m', group: 'Events', icon: 'easel-outline', price: 120000, unit: 'day', deposit: 150000, description: 'Modular stage with skirting and steps.', vendor: 'StageCraft', vendorArea: 'Victoria Island, Lagos', stock: 2, relatedCategoryIds: ['decorator', 'dj', 'mc'] },
  { id: 'r_camera', kind: 'rental', name: 'Canon R6 + 24–70mm Lens', group: 'Media', icon: 'camera-outline', price: 30000, unit: 'day', deposit: 250000, description: 'Full-frame mirrorless kit with 2 batteries and cards.', vendor: 'LensHire Lagos', vendorArea: 'Ikeja, Lagos', stock: 4, relatedCategoryIds: ['photographer', 'videographer'] },
  { id: 'r_speakers', kind: 'rental', name: 'PA Speakers & Mixer Set', group: 'Media', icon: 'musical-notes-outline', price: 50000, unit: 'day', deposit: 80000, description: '2 active speakers, 2 wireless mics, 8-channel mixer.', vendor: 'SoundBox', vendorArea: 'Lekki, Lagos', stock: 6, relatedCategoryIds: ['dj', 'sound_engineer', 'mc'] },
  { id: 'r_scaffold', kind: 'rental', name: 'Scaffolding Set', group: 'Construction', icon: 'construct-outline', price: 20000, unit: 'day', deposit: 60000, description: '6m scaffolding tower with safety rails.', vendor: 'BuildHire', vendorArea: 'Ikorodu, Lagos', stock: 7, relatedCategoryIds: ['painter', 'roofer', 'mason'] },
  { id: 'r_pressure', kind: 'rental', name: 'Pressure Washer', group: 'Construction', icon: 'water-outline', price: 12000, unit: 'day', deposit: 30000, description: 'Electric 2000W pressure washer.', vendor: 'BuildHire', vendorArea: 'Ikorodu, Lagos', stock: 9, relatedCategoryIds: ['cleaner', 'car_wash', 'deep_cleaning'] },
];

export function serviceItem(id: string): ServiceItem | undefined {
  return SERVICE_ITEMS.find((x) => x.id === id);
}
