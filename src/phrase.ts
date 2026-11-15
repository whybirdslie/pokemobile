const WORDS = [
  "amber", "apple", "beach", "berry", "birch", "bloom", "brook", "cedar",
  "clover", "coral", "creek", "daisy", "dawn", "field", "flame", "frost",
  "garden", "grove", "harbor", "honey", "island", "ivory", "jade", "lake",
  "leaf", "lily", "maple", "meadow", "moon", "moss", "orchid", "pearl",
  "pebble", "pine", "pond", "rain", "reed", "ridge", "river", "rose",
  "sage", "shore", "spring", "stone", "storm", "trail", "violet", "wave",
  "willow", "wind", "woods", "cloud", "fern", "flint", "glen", "haze",
  "kelp", "mist", "quartz", "sun", "tide", "vale", "comet", "ember",
]

export function suggestPhrase() {
  const roll = new Uint32Array(3)
  crypto.getRandomValues(roll)
  const picked: string[] = []
  for (const n of roll) {
    let index = n % WORDS.length
    let guard = 0
    while (picked.includes(WORDS[index]) && guard++ < WORDS.length) {
      index = (index + 1) % WORDS.length
    }
    picked.push(WORDS[index])
  }
  return picked.join(" ")
}

export function normalizePhrase(input: string) {
  const words = input
    .toLowerCase()
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
  if (words.length < 2 || words.length > 4) return null
  if (!words.every((word) => /^[a-z]{3,12}$/.test(word))) return null
  return words.join("-")
}

export function showPhrase(key: string) {
  return key
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
