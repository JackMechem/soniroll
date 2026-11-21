/** "Db" → "D♭", "F#m" → "F♯m", "C-" → "Cm": a key's name with the music symbols, minor as "m"
    (charts write it "C-"). */
export function prettyKeyName(name: string) {
  return name
    .replace(/^([A-Ga-g])b/, '$1♭')
    .replace(/^([A-Ga-g])#/, '$1♯')
    .replace(/^([A-Ga-g][♭♯]?)-$/, '$1m');
}

/** Minor if written as minor ("Dm", "D-", "Dmin"). */
export function isMinorKey(value: string) {
  return /^[A-Ga-g][#b]?(m(?!aj)|-|min)/.test(value.trim());
}
