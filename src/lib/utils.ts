export function cn(...inputs: (string | undefined | null | false | Record<string, boolean>)[]) {
  return inputs
    .flatMap((x) => {
      if (!x) return [];
      if (typeof x === 'string') return [x];
      return Object.entries(x)
        .filter(([, v]) => Boolean(v))
        .map(([k]) => k);
    })
    .join(' ');
}
