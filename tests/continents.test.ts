import test from "node:test";
import assert from "node:assert/strict";
import { continentForCountry } from "../src/lib/continents";

test("classificar continentes, territórios e casos transcontinentais pela convenção local", () => {
  for (const [country, expected] of Object.entries({
    AF: "AS",
    SA: "AS",
    NA: "AF",
    AS: "OC",
    US: "NA",
    CA: "NA",
    MX: "NA",
    PA: "NA",
    PR: "NA",
    GL: "NA",
    BR: "SA",
    GF: "SA",
    PT: "EU",
    RU: "EU",
    GB: "EU",
    TR: "AS",
    CY: "AS",
    KZ: "AS",
    JP: "AS",
    IN: "AS",
    ZA: "AF",
    EG: "AF",
    AU: "OC",
    NZ: "OC",
    AQ: "AN",
    OTHER: "UNKNOWN",
    ZZ: "UNKNOWN",
    "": "UNKNOWN",
  }))
    assert.equal(continentForCountry(country), expected, country);
});
