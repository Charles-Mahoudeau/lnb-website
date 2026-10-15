/** "Farmer's Delight" becomes "FD", and "Sodium" "So": the tile shown without an icon. */
export function modInitials(name: string): string {
  // Apostrophes join words: "Farmer's" is one word, not "Farmer" and "s".
  const words = name.replace(/['’]/g, '').match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2);
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}
