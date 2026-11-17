import { createHash } from "node:crypto";

// Fingerprints keep retired operational values out of new source copies.
// Replacements are fixed synthetic fixtures shared with the API examples.
const REPLACEMENTS = new Map([
  [
    "5e4c2c27a5ec5ecde11d5fa6999312be990a584398023a72ce5cfc4ee7440ec4",
    "cus_4mT8xN2pQ7rV6sL1dZ9y",
  ],
  [
    "0f4b7aed30bc74ee62dc22e7a93331845f0cc8b911b93c3c1ceac50567f4cc0b",
    "0x5da48d5b60aebab3c4e8b648e6e8ad64d1f708cd",
  ],
  [
    "3712d64b37f9b2043429c86730986757d4045e625cfb6fffdb55053547a75454",
    "0x6c43d4414362bd3c5ccad64b75ff3c727d0ed805",
  ],
  [
    "803f2d55f4894a206d74f4b6aa0529923545fce79d4d4a1c0db1edc24b8c78d4",
    "581480407",
  ],
  [
    "d3e549bebf7d8018f75d4c67bd5e060ff144743fec8e79d0adb4c7cf984e08f3",
    "352494718023",
  ],
]);

function syntheticValue(value, replacements) {
  if (typeof value === "string") {
    const fingerprint = createHash("sha256").update(value).digest("hex");
    const replacement = replacements.get(fingerprint);
    if (replacement !== undefined) return replacement;
    return /^[A-Za-z0-9._%+-]+@swipelux\.com$/i.test(value)
      ? value.replace(/@swipelux\.com$/i, "@example.com")
      : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => syntheticValue(item, replacements));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        syntheticValue(item, replacements),
      ]),
    );
  }
  return value;
}

// Tests pass their own fingerprints so fixtures never need a retired value.
export function syntheticExampleChanges(spec, replacements = REPLACEMENTS) {
  const changes = [];
  function visit(node, pointer) {
    if (node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      const child = `${pointer}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
      if (key === "example" || key === "examples") {
        const replacement = syntheticValue(value, replacements);
        if (JSON.stringify(value) !== JSON.stringify(replacement)) {
          changes.push({ pointer: child, value: replacement });
        }
      } else {
        visit(value, child);
      }
    }
  }
  visit(spec, "");
  return changes;
}
