export const DEFAULT_USER_MESSAGE_COLOR = '#eaf3ff';

/** Accept a six-digit opaque color, never arbitrary CSS. */
export function normalizeUserMessageColor(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : DEFAULT_USER_MESSAGE_COLOR;
}

/** Choose the foreground with the higher WCAG contrast ratio. */
export function getUserMessageTextColor(value: unknown): string {
  const color = normalizeUserMessageColor(value);
  const channels = [1, 3, 5].map(offset => {
    const channel = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);
  return blackContrast >= whiteContrast ? '#000000' : '#ffffff';
}
