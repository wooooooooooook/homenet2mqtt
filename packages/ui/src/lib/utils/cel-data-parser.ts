export const parseCelDataInput = (input: string): number[] | undefined => {
  if (!input.trim()) return undefined;
  const trimmed = input.trim();

  // 1. Try JSON-like Array parsing (Relaxed)
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const body = trimmed.slice(1, -1).trim();
    if (!body) return [];
    const tokens = body.split(',').map((t) => t.trim());
    const values = tokens.map((token) => {
      if (!token) return NaN;
      // Handle 0x prefix for explicit hex in array
      if (/^0x[0-9a-fA-F]+$/i.test(token)) {
        return Number.parseInt(token, 16);
      }
      return Number(token);
    });

    if (values.some(Number.isNaN)) {
      throw new Error('INVALID_NUMBER_ARRAY');
    }
    return values;
  }

  // 2. Hex Stream parsing (Fallback)
  // Split by whitespace or comma
  const tokens = trimmed.split(/[\s,]+/).filter((t) => t.length > 0);
  const values = tokens.map((token) => {
    // Always treat as hex in raw stream mode, handling 0x prefix if present
    let cleanToken = token;
    if (token.toLowerCase().startsWith('0x')) {
      cleanToken = token.slice(2);
    }

    // Check if it's a valid hex string before parsing to avoid partial parsing success
    // e.g. "10z" would be parsed as 16 by parseInt, but it is invalid.
    if (!/^[0-9a-fA-F]+$/.test(cleanToken)) {
      return NaN;
    }
    return parseInt(cleanToken, 16);
  });

  if (values.some(Number.isNaN)) {
    throw new Error('INVALID_FORMAT');
  }

  return values;
};
