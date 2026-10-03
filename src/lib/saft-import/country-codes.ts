/**
 * ISO 3166-1 alpha-2 → Danish country name mapping.
 *
 * Used by the SAF-T importer to convert country codes (e.g. "DK", "DE")
 * from SAF-T XML to Danish display names stored in AlphaFlow's Contact model.
 * This is the inverse of the exporter's normalizeCountry() function.
 */

const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  'DK': 'Danmark',
  'DE': 'Tyskland',
  'SE': 'Sverige',
  'NO': 'Norge',
  'FI': 'Finland',
  'GB': 'England',
  'US': 'USA',
  'FR': 'Frankrig',
  'NL': 'Holland',
  'BE': 'Belgien',
  'AT': 'Østrig',
  'CH': 'Schweiz',
  'ES': 'Spanien',
  'IT': 'Italien',
  'PL': 'Polen',
  'IE': 'Irland',
  'PT': 'Portugal',
  'GR': 'Grækenland',
  'CZ': 'Tjekkiet',
  'HU': 'Ungarn',
  'RO': 'Rumænien',
  'BG': 'Bulgarien',
  'HR': 'Kroatien',
  'LT': 'Litauen',
  'LV': 'Letland',
  'EE': 'Estland',
  'SK': 'Slovakiet',
  'SI': 'Slovenien',
  'LU': 'Luxembourg',
  'MT': 'Malta',
  'CY': 'Cypern',
  'IS': 'Island',
  'CA': 'Canada',
  'AU': 'Australien',
  'JP': 'Japan',
  'CN': 'Kina',
  'IN': 'Indien',
  'BR': 'Brasilien',
  'RU': 'Rusland',
  'TR': 'Tyrkiet',
  'AE': 'Forenede Arabiske Emirater',
  'SA': 'Saudi-Arabien',
  'QA': 'Qatar',
  'SG': 'Singapore',
  'HK': 'Hong Kong',
  'KR': 'Sydkorea',
  'MX': 'Mexico',
  'AR': 'Argentina',
  'ZA': 'Sydafrika',
  'TH': 'Thailand',
  'MY': 'Malaysia',
  'ID': 'Indonesien',
  'PH': 'Filippinerne',
  'VN': 'Vietnam',
  'NZ': 'New Zealand',
  'EG': 'Egypten',
  'MA': 'Marokko',
  'NG': 'Nigeria',
  'KE': 'Kenya',
};

/**
 * Convert an ISO 3166-1 alpha-2 country code to a Danish display name.
 * Falls back to the code itself if no mapping exists.
 */
export function countryCodeToName(code: string | null | undefined): string {
  if (!code) return 'Danmark';
  const trimmed = code.trim().toUpperCase();
  return COUNTRY_CODE_TO_NAME[trimmed] || trimmed;
}
