import { SEARCH_ENGINE_TEMPLATES } from '../../../shared/browserSearch';

export const DEFAULT_SEARCH_ENGINE = SEARCH_ENGINE_TEMPLATES.duckduckgo;

const DOMAIN_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?:[/:?#].*)?$/i;

const isHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const buildSearchUrl = (value: string, template: string): string => {
  return template.split('{query}').join(encodeURIComponent(value));
};

export const normalizeAddressInput = (
  input: string,
  searchTemplate = DEFAULT_SEARCH_ENGINE,
): { ok: true; url: string } | { ok: false; error: string } => {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: 'Address cannot be empty.' };
  }

  if (isHttpUrl(trimmed)) {
    return { ok: true, url: trimmed };
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return { ok: false, error: 'Only http and https are supported.' };
  }

  if (DOMAIN_PATTERN.test(trimmed)) {
    return { ok: true, url: `https://${trimmed}` };
  }

  return { ok: true, url: buildSearchUrl(trimmed, searchTemplate) };
};
