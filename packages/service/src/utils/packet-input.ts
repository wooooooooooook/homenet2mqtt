const parseNumberListInput = (input: string): number[] | null => {
  const trimmed = input.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
  const body = trimmed.slice(1, -1).trim();
  if (!body) return [];
  const tokens = body.split(',').map((token) => token.trim());
  const values = tokens.map((token) => {
    if (!token) return NaN;
    if (/^0x[0-9a-fA-F]+$/.test(token)) {
      return Number.parseInt(token, 16);
    }
    return Number(token);
  });
  if (values.some((value) => Number.isNaN(value))) {
    return null;
  }
  return values;
};

const parseHexInput = (input: string): number[] | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.includes('0x')) {
    const tokens = trimmed.match(/0x[0-9a-fA-F]+/g);
    if (!tokens) return null;
    const bytes: number[] = [];
    for (const token of tokens) {
      const hex = token.slice(2);
      if (hex.length % 2 !== 0) return null;
      for (let i = 0; i < hex.length; i += 2) {
        bytes.push(Number.parseInt(hex.slice(i, i + 2), 16));
      }
    }
    return bytes;
  }

  const normalized = trimmed.replace(/[^0-9a-fA-F]/g, '');
  if (!normalized || normalized.length % 2 !== 0) return null;
  const bytes: number[] = [];
  for (let i = 0; i < normalized.length; i += 2) {
    bytes.push(Number.parseInt(normalized.slice(i, i + 2), 16));
  }
  return bytes;
};

export const parsePacketInput = (input: unknown): { bytes: number[] } | { error: string } => {
  if (Array.isArray(input)) {
    const bytes = input.map((value) => Number(value));
    if (bytes.some((value) => Number.isNaN(value))) {
      return { error: '입력 배열은 숫자로만 구성되어야 합니다.' };
    }
    if (bytes.some((value) => value < 0 || value > 255)) {
      return { error: '입력 배열 값은 0~255 범위여야 합니다.' };
    }
    return { bytes };
  }

  if (typeof input === 'string') {
    const listParsed = parseNumberListInput(input);
    if (listParsed) {
      if (listParsed.some((value) => value < 0 || value > 255)) {
        return { error: '입력 배열 값은 0~255 범위여야 합니다.' };
      }
      return { bytes: listParsed };
    }

    const hexParsed = parseHexInput(input);
    if (!hexParsed) {
      return { error: '입력값을 Hex 문자열 또는 [int] 배열로 해석할 수 없습니다.' };
    }
    if (hexParsed.some((value) => value < 0 || value > 255)) {
      return { error: 'Hex 입력은 0~255 범위의 바이트여야 합니다.' };
    }
    return { bytes: hexParsed };
  }

  return { error: '입력값은 문자열 또는 숫자 배열이어야 합니다.' };
};
