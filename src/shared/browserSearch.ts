export type SearchEngineId = 'duckduckgo' | 'brave' | 'google' | 'bing' | 'custom';

export const DEFAULT_SEARCH_ENGINE_ID: SearchEngineId = 'duckduckgo';

export const SEARCH_ENGINE_TEMPLATES: Record<Exclude<SearchEngineId, 'custom'>, string> = {
  duckduckgo: 'https://duckduckgo.com/?q={query}',
  brave: 'https://search.brave.com/search?q={query}',
  google: 'https://www.google.com/search?q={query}',
  bing: 'https://www.bing.com/search?q={query}',
};

export const validateCustomSearchTemplate = (template: string): string | null => {
  const trimmed = template.trim();
  if (!trimmed) return 'Custom search template is required.';
  if (!trimmed.startsWith('https://')) return 'Custom search template must start with https://.';
  if (!trimmed.includes('{query}')) return 'Custom search template must include {query}.';
  try {
    // Validate that replacing the token creates a well-formed HTTPS URL.
    const parsed = new URL(trimmed.split('{query}').join('test'));
    if (parsed.protocol !== 'https:') return 'Custom search template must start with https://.';
  } catch {
    return 'Custom search template must be a valid URL.';
  }
  return null;
};

export const resolveSearchTemplate = (
  searchEngine: SearchEngineId,
  customSearchTemplate: string,
): string => {
  if (searchEngine === 'custom') {
    return validateCustomSearchTemplate(customSearchTemplate) === null
      ? customSearchTemplate.trim()
      : SEARCH_ENGINE_TEMPLATES.duckduckgo;
  }
  return SEARCH_ENGINE_TEMPLATES[searchEngine] ?? SEARCH_ENGINE_TEMPLATES.duckduckgo;
};
