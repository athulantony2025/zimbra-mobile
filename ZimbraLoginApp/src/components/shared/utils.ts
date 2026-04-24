export const toArray = <T,>(value?: T | T[] | null): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

export const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const splitCsvValues = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .flatMap(entry => String(entry ?? '').split(','))
      .map(entry => entry.trim())
      .filter(Boolean);
  }

  const text = String(value ?? '').trim();
  if (!text) return [];
  return text
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
};

export const normalizeHexColor = (value: string) => {
  const trimmed = value.trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) return '';
  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return trimmed.toLowerCase();
};

export const decimalToHexColor = (value: number) => {
  const clamped = Math.max(0, Math.min(0xffffff, Math.trunc(value)));
  return `#${clamped.toString(16).padStart(6, '0')}`;
};
