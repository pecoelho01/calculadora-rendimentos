const english = new Intl.DisplayNames(["en"], { type: "region" });
const countries = new Map<string, string>();
for (let first = 65; first <= 90; first++) {
  for (let second = 65; second <= 90; second++) {
    const code = String.fromCharCode(first, second);
    const name = english.of(code);
    if (name && name !== code) countries.set(name, code);
  }
}
for (const [name, code] of Object.entries({
  Other: "OTHER",
  "United Kingdom": "GB",
  "South Korea": "KR",
  "Czech Republic": "CZ",
  Turkey: "TR",
  "Russian Federation": "RU",
  "Hong Kong": "HK",
  "Taiwan, Province of China": "TW",
}))
  countries.set(name, code);
export const countryCode = (name: string) => countries.get(name);
