import type { Category, FeeType } from '../domain/types';

const c = (
  id: string,
  name: string,
  group: string,
  icon: string,
  opts: Partial<Pick<Category, 'risk' | 'defaultSize' | 'multiJobFriendly' | 'videoBrief'>> = {},
): Category => ({
  id,
  name,
  group,
  icon,
  risk: opts.risk ?? 'standard',
  defaultSize: opts.defaultSize ?? 'normal',
  multiJobFriendly: opts.multiJobFriendly,
  videoBrief: opts.videoBrief ?? `Show yourself doing real ${name.toLowerCase()} work from start to finish. Keep your face visible at the start and end.`,
});

/** 100 trades. `high` risk trades get priority in the Trust team's audit. */
export const CATEGORIES: Category[] = [
  // Home repairs
  c('electrician', 'Electrician', 'Home Repairs', 'flash-outline', { risk: 'high', videoBrief: 'Show safe isolation (breaker off), testing with a meter, and a full socket or fitting installation.' }),
  c('plumber', 'Plumber', 'Home Repairs', 'water-outline', { videoBrief: 'Show a leak fix or pipe fitting, including testing for leaks afterwards.' }),
  c('carpenter', 'Carpenter', 'Home Repairs', 'hammer-outline', { videoBrief: 'Measure, cut and join wood for a real piece (door, shelf, cabinet).' }),
  c('painter', 'Painter', 'Home Repairs', 'color-palette-outline', { defaultSize: 'large' }),
  c('tiler', 'Tiler', 'Home Repairs', 'grid-outline', { defaultSize: 'large' }),
  c('mason', 'Bricklayer / Mason', 'Home Repairs', 'layers-outline', { defaultSize: 'large', risk: 'high' }),
  c('welder', 'Welder / Fabricator', 'Home Repairs', 'flame-outline', { risk: 'high' }),
  c('pop_ceiling', 'POP & Ceiling', 'Home Repairs', 'home-outline', { defaultSize: 'large' }),
  c('roofer', 'Roofer', 'Home Repairs', 'umbrella-outline', { risk: 'high', defaultSize: 'large' }),
  c('locksmith', 'Locksmith', 'Home Repairs', 'key-outline', { defaultSize: 'short', multiJobFriendly: true, risk: 'high' }),
  c('glazier', 'Glass & Aluminium', 'Home Repairs', 'easel-outline'),
  c('furniture_repair', 'Furniture Repair', 'Home Repairs', 'bed-outline'),

  // Appliances & tech
  c('ac_tech', 'AC Repair & Install', 'Appliances & Tech', 'snow-outline', { risk: 'high' }),
  c('fridge_tech', 'Fridge & Freezer Repair', 'Appliances & Tech', 'thermometer-outline'),
  c('generator_tech', 'Generator Repair', 'Appliances & Tech', 'battery-charging-outline', { multiJobFriendly: true }),
  c('solar_installer', 'Solar & Inverter', 'Appliances & Tech', 'sunny-outline', { risk: 'high', defaultSize: 'large' }),
  c('tv_tech', 'TV & Electronics Repair', 'Appliances & Tech', 'tv-outline', { defaultSize: 'short', multiJobFriendly: true }),
  c('phone_repair', 'Phone Repair', 'Appliances & Tech', 'phone-portrait-outline', { defaultSize: 'short', multiJobFriendly: true }),
  c('computer_repair', 'Laptop & Computer Repair', 'Appliances & Tech', 'laptop-outline', { defaultSize: 'short', multiJobFriendly: true }),
  c('cctv', 'CCTV & Security Systems', 'Appliances & Tech', 'videocam-outline', { risk: 'high' }),
  c('network_tech', 'Wi-Fi & Networking', 'Appliances & Tech', 'wifi-outline', { defaultSize: 'short' }),
  c('dstv_installer', 'Satellite / Decoder Install', 'Appliances & Tech', 'planet-outline', { defaultSize: 'short', multiJobFriendly: true }),
  c('printer_tech', 'Printer & Office Equipment', 'Appliances & Tech', 'print-outline', { defaultSize: 'short' }),

  // Auto
  c('mechanic', 'Auto Mechanic', 'Auto', 'car-sport-outline', { defaultSize: 'short', multiJobFriendly: true, videoBrief: 'Diagnose and fix a real fault (e.g. brake pads, plugs, belts). Show the before and after.' }),
  c('auto_electrician', 'Auto Electrician', 'Auto', 'hardware-chip-outline', { defaultSize: 'short', multiJobFriendly: true }),
  c('panel_beater', 'Panel Beater & Spray', 'Auto', 'brush-outline', { defaultSize: 'large' }),
  c('vulcanizer', 'Vulcanizer / Tyres', 'Auto', 'speedometer-outline', { defaultSize: 'short', multiJobFriendly: true }),
  c('car_wash', 'Mobile Car Wash', 'Auto', 'car-outline', { defaultSize: 'short', multiJobFriendly: true }),
  c('driver', 'Professional Driver', 'Auto', 'bus-outline', { risk: 'high' }),
  c('bike_repair', 'Bike & Okada Repair', 'Auto', 'bicycle-outline', { defaultSize: 'short', multiJobFriendly: true }),

  // Cleaning & home care
  c('cleaner', 'House Cleaning', 'Cleaning & Home', 'sparkles-outline', { videoBrief: 'Clean a real room: show before, the process (surfaces, floors) and the finished result.' }),
  c('deep_cleaning', 'Deep / Post-Construction Cleaning', 'Cleaning & Home', 'sparkles-outline', { defaultSize: 'large' }),
  c('laundry', 'Laundry & Ironing', 'Cleaning & Home', 'shirt-outline', { multiJobFriendly: true }),
  c('fumigation', 'Fumigation & Pest Control', 'Cleaning & Home', 'bug-outline', { risk: 'high' }),
  c('gardener', 'Gardener / Landscaping', 'Cleaning & Home', 'leaf-outline'),
  c('waste', 'Waste Disposal', 'Cleaning & Home', 'trash-outline', { defaultSize: 'short' }),
  c('pool', 'Pool Cleaning', 'Cleaning & Home', 'water-outline'),
  c('upholstery', 'Upholstery & Rug Cleaning', 'Cleaning & Home', 'bed-outline'),
  c('movers', 'Movers & Packers', 'Cleaning & Home', 'cube-outline', { defaultSize: 'large' }),
  c('nanny', 'Nanny / Childcare', 'Cleaning & Home', 'happy-outline', { risk: 'high' }),
  c('caregiver', 'Elderly Caregiver', 'Cleaning & Home', 'medkit-outline', { risk: 'high' }),

  // Fashion & beauty
  c('tailor', 'Tailor / Fashion Designer', 'Fashion & Beauty', 'cut-outline', { multiJobFriendly: true, videoBrief: 'Take measurements, cut fabric and sew a real garment section on camera.' }),
  c('hair_stylist', 'Hair Stylist', 'Fashion & Beauty', 'woman-outline', { defaultSize: 'short', multiJobFriendly: true }),
  c('barber', 'Barber', 'Fashion & Beauty', 'man-outline', { defaultSize: 'short', multiJobFriendly: true }),
  c('makeup', 'Makeup Artist', 'Fashion & Beauty', 'brush-outline', { defaultSize: 'short', multiJobFriendly: true }),
  c('nails', 'Nail Technician', 'Fashion & Beauty', 'hand-left-outline', { defaultSize: 'short', multiJobFriendly: true }),
  c('cobbler', 'Shoe Maker / Cobbler', 'Fashion & Beauty', 'footsteps-outline', { defaultSize: 'short', multiJobFriendly: true }),
  c('gele', 'Gele & Headtie Stylist', 'Fashion & Beauty', 'ribbon-outline', { defaultSize: 'short', multiJobFriendly: true }),
  c('massage', 'Massage Therapist', 'Fashion & Beauty', 'body-outline', { risk: 'high', defaultSize: 'short' }),

  // Events & media
  c('photographer', 'Photographer', 'Events & Media', 'camera-outline', { multiJobFriendly: true, videoBrief: 'Show a real shoot: setting up, directing the subject, and the edited results on your device.' }),
  c('videographer', 'Videographer', 'Events & Media', 'film-outline', { multiJobFriendly: true }),
  c('dj', 'DJ', 'Events & Media', 'musical-notes-outline'),
  c('mc', 'MC / Compere', 'Events & Media', 'mic-outline'),
  c('decorator', 'Event Decorator', 'Events & Media', 'balloon-outline', { defaultSize: 'large' }),
  c('caterer', 'Caterer / Small Chops', 'Events & Media', 'restaurant-outline', { defaultSize: 'large' }),
  c('baker', 'Cake & Baker', 'Events & Media', 'cafe-outline', { multiJobFriendly: true }),
  c('sound_engineer', 'Sound & PA Engineer', 'Events & Media', 'headset-outline'),
  c('ushers', 'Ushers & Event Staff', 'Events & Media', 'people-outline'),
  c('graphic_designer', 'Graphic Designer', 'Events & Media', 'color-palette-outline', { multiJobFriendly: true }),

  // Lessons & wellness
  c('tutor', 'Home Tutor', 'Lessons & Wellness', 'school-outline', { multiJobFriendly: true, risk: 'high' }),
  c('fitness', 'Fitness Trainer', 'Lessons & Wellness', 'barbell-outline', { defaultSize: 'short', multiJobFriendly: true }),
  c('chef', 'Private Chef / Cook', 'Lessons & Wellness', 'pizza-outline'),
  c('pet_care', 'Pet Grooming & Care', 'Lessons & Wellness', 'paw-outline', { defaultSize: 'short', multiJobFriendly: true }),
  c('security_guard', 'Security Guard', 'Lessons & Wellness', 'shield-checkmark-outline', { risk: 'high', defaultSize: 'large' }),  // Added trades (64 → 100)
  c('interior_designer', 'Interior Designer', 'Home Repairs', 'easel-outline', { defaultSize: 'large' }),
  c('wallpaper', 'Wallpaper & 3D Panels', 'Home Repairs', 'albums-outline'),
  c('plasterer', 'Screeding & Plastering', 'Home Repairs', 'construct-outline', { defaultSize: 'large' }),
  c('borehole', 'Borehole & Water Pump', 'Home Repairs', 'water-outline', { risk: 'high', defaultSize: 'large' }),
  c('water_tank', 'Water Tank Cleaning & Install', 'Home Repairs', 'beaker-outline'),
  c('doors_windows', 'Doors & Windows Installer', 'Home Repairs', 'browsers-outline'),
  c('interlock', 'Interlocking & Paving', 'Home Repairs', 'apps-outline', { defaultSize: 'large' }),
  c('electric_fence', 'Electric Fence & Razor Wire', 'Home Repairs', 'flash-outline', { risk: 'high' }),
  c('gas_installer', 'Gas Pipe & Cylinder Installer', 'Home Repairs', 'flame-outline', { risk: 'high' }),
  c('septic', 'Septic Tank Evacuation', 'Home Repairs', 'trash-outline'),
  c('curtains', 'Curtains & Blinds', 'Home Repairs', 'reorder-four-outline', { defaultSize: 'short' }),
  c('tv_mounting', 'TV Wall Mounting', 'Home Repairs', 'tv-outline', { defaultSize: 'short', multiJobFriendly: true }),
  c('handyman', 'Handyman (Small Fixes)', 'Home Repairs', 'build-outline', { defaultSize: 'short', multiJobFriendly: true }),
  c('washing_machine', 'Washing Machine Repair', 'Appliances & Tech', 'sync-outline'),
  c('cooker_repair', 'Gas Cooker & Oven Repair', 'Appliances & Tech', 'bonfire-outline', { risk: 'high' }),
  c('water_heater', 'Water Heater Repair', 'Appliances & Tech', 'thermometer-outline'),
  c('web_developer', 'Website & App Developer', 'Appliances & Tech', 'code-slash-outline', { defaultSize: 'large' }),
  c('smart_home', 'Smart Home & Intercom', 'Appliances & Tech', 'home-outline'),
  c('meter_installer', 'Prepaid Meter Installer', 'Appliances & Tech', 'speedometer-outline', { risk: 'high' }),
  c('auto_ac', 'Car AC Repair', 'Auto', 'snow-outline'),
  c('towing', 'Towing & Recovery', 'Auto', 'car-outline', { defaultSize: 'short' }),
  c('car_detailing', 'Car Detailing', 'Auto', 'sparkles-outline', { defaultSize: 'short', multiJobFriendly: true }),
  c('car_tracker', 'Car Tracker Install', 'Auto', 'locate-outline', { defaultSize: 'short' }),
  c('office_cleaning', 'Office Cleaning', 'Cleaning & Home', 'business-outline'),
  c('housekeeper', 'Housekeeper', 'Cleaning & Home', 'home-outline', { defaultSize: 'large' }),
  c('braider', 'Hair Braider', 'Fashion & Beauty', 'git-merge-outline'),
  c('lash_brow', 'Lash & Brow Technician', 'Fashion & Beauty', 'eye-outline', { defaultSize: 'short', multiJobFriendly: true }),
  c('jeweller', 'Jewellery Repair', 'Fashion & Beauty', 'diamond-outline', { defaultSize: 'short' }),
  c('event_planner', 'Event Planner', 'Events & Media', 'calendar-outline', { defaultSize: 'large' }),
  c('live_band', 'Live Band / Musician', 'Events & Media', 'musical-notes-outline', { defaultSize: 'large' }),
  c('drone', 'Drone Photography', 'Events & Media', 'airplane-outline'),
  c('printing', 'Printing & Branding', 'Events & Media', 'print-outline'),
  c('music_teacher', 'Music Teacher', 'Lessons & Wellness', 'musical-note-outline', { defaultSize: 'short', multiJobFriendly: true }),
  c('driving_instructor', 'Driving Instructor', 'Lessons & Wellness', 'speedometer-outline', { defaultSize: 'short', multiJobFriendly: true }),
  c('physio', 'Physiotherapist', 'Lessons & Wellness', 'body-outline', { risk: 'high', defaultSize: 'short' }),
  c('home_nurse', 'Home Nurse', 'Lessons & Wellness', 'medkit-outline', { risk: 'high', defaultSize: 'large' }),
];

// ---------------------------------------------------------------------------
// Upfront fees: every booking starts with one fee, paid before the artisan engages.
// Sleek sets the default type per trade; each artisan can change the type and amount.
// ---------------------------------------------------------------------------

/** Trades where the artisan must come and see the problem before quoting. */
const INSPECTION = new Set(['electrician', 'plumber', 'carpenter', 'painter', 'tiler', 'mason', 'welder', 'pop_ceiling', 'roofer', 'glazier', 'ac_tech', 'fridge_tech', 'generator_tech', 'solar_installer', 'cctv', 'mechanic', 'auto_electrician', 'panel_beater', 'fumigation', 'pool', 'plasterer', 'borehole', 'water_tank', 'doors_windows', 'interlock', 'electric_fence', 'gas_installer', 'septic', 'washing_machine', 'cooker_repair', 'water_heater', 'smart_home', 'meter_installer', 'auto_ac', 'deep_cleaning', 'upholstery', 'movers', 'wallpaper', 'network_tech']);
/** Trades where the first step is advice or planning. */
const CONSULTANCY = new Set(['interior_designer', 'event_planner', 'decorator', 'web_developer', 'graphic_designer', 'physio', 'caterer', 'tutor', 'fitness', 'printing', 'live_band']);

export const DEFAULT_FEE_AMOUNT: Record<FeeType, number> = { booking: 2000, consultancy: 5000, inspection: 5000 };

export function defaultFeeType(categoryId: string): FeeType {
  return INSPECTION.has(categoryId) ? 'inspection' : CONSULTANCY.has(categoryId) ? 'consultancy' : 'booking';
}

const byId = new Map(CATEGORIES.map((x) => [x.id, x]));
export function category(id: string): Category {
  return byId.get(id) ?? CATEGORIES[0];
}
export function categoryName(id: string): string {
  return byId.get(id)?.name ?? id;
}

export const CATEGORY_GROUPS = [...new Set(CATEGORIES.map((x) => x.group))];

/** Shown on the customer home screen. */
export const POPULAR_CATEGORY_IDS = ['mechanic', 'cleaner', 'electrician', 'plumber', 'tailor', 'photographer', 'carpenter', 'ac_tech'];

export const CITIES = ['Lagos', 'Abuja', 'Port Harcourt', 'Ibadan', 'Kano', 'Enugu', 'Benin City'];
