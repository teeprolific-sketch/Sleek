/**
 * Approximate area centroids. Sleek never stores or shows an artisan's exact
 * location: distance and the "nearby" view use area-level centroids only.
 */
const AREAS: Record<string, [number, number]> = {
  // Lagos
  'lagos|yaba': [6.5095, 3.3711], 'lagos|surulere': [6.5008, 3.3533], 'lagos|ikeja': [6.6018, 3.3515], 'lagos|ikeja gra': [6.581, 3.357],
  'lagos|lekki phase 1': [6.4474, 3.472], 'lagos|lekki': [6.4474, 3.472], 'lagos|victoria island': [6.4281, 3.4219], 'lagos|ikoyi': [6.4549, 3.4366],
  'lagos|ajah': [6.4672, 3.571], 'lagos|magodo': [6.62, 3.385], 'lagos|lagos island': [6.4541, 3.3947], 'lagos|gbagada': [6.555, 3.389],
  'lagos|maryland': [6.57, 3.367], 'lagos|ogba': [6.628, 3.341], 'lagos|agege': [6.618, 3.324], 'lagos|apapa': [6.448, 3.359],
  'lagos|festac': [6.466, 3.283], 'lagos|ikorodu': [6.619, 3.505], 'lagos|oshodi': [6.555, 3.343], 'lagos|mushin': [6.527, 3.354],
  'lagos|ojo': [6.463, 3.17], 'lagos|ilupeju': [6.553, 3.357], 'lagos|bariga': [6.54, 3.387], 'lagos|sangotedo': [6.47, 3.63],
  'lagos|oniru': [6.435, 3.45], 'lagos|ebute metta': [6.485, 3.38],
  // Abuja
  'abuja|gwarinpa': [9.105, 7.41], 'abuja|wuse 2': [9.079, 7.473], 'abuja|wuse': [9.065, 7.47], 'abuja|garki': [9.03, 7.49],
  'abuja|maitama': [9.088, 7.497], 'abuja|asokoro': [9.043, 7.525], 'abuja|jabi': [9.07, 7.43], 'abuja|kubwa': [9.155, 7.322], 'abuja|lugbe': [8.98, 7.37],
  // Others
  'port harcourt|gra phase 2': [4.824, 7.005], 'port harcourt|rumuola': [4.838, 7.011], 'port harcourt|trans-amadi': [4.81, 7.04],
  'ibadan|bodija': [7.43, 3.91], 'ibadan|ring road': [7.36, 3.88],
  'enugu|independence layout': [6.445, 7.51], 'enugu|new haven': [6.45, 7.5],
  'kano|nassarawa': [12.0, 8.53], 'kano|sabon gari': [12.005, 8.525],
};
const CITIES: Record<string, [number, number]> = {
  lagos: [6.5244, 3.3792], abuja: [9.0765, 7.3986], 'port harcourt': [4.8156, 7.0498], ibadan: [7.3775, 3.947], kano: [12.0022, 8.592], enugu: [6.4402, 7.4943], 'benin city': [6.335, 5.6037],
};

export function areaPoint(area: string, city: string): [number, number] | null {
  const c = city.trim().toLowerCase();
  return AREAS[`${c}|${area.trim().toLowerCase()}`] ?? CITIES[c] ?? null;
}

export function distanceKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Distance between two areas, rounded to 0.5 km (never more precise than area level). */
export function areaDistanceKm(from: { area: string; city: string }, to: { area: string; city: string }): number | null {
  const a = areaPoint(from.area, from.city);
  const b = areaPoint(to.area, to.city);
  if (!a || !b) return null;
  return Math.round(distanceKm(a, b) * 2) / 2;
}
