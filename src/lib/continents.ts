// Unicode License V3; see THIRD_PARTY_NOTICES.md.
// Local snapshot of Unicode CLDR 49 territory containment (no runtime lookup).
// https://github.com/unicode-org/cldr-json/blob/main/cldr-json/cldr-core/supplemental/territoryContainment.json
// North America includes Central America and the Caribbean. Antarctica is separate;
// CLDR's undefined outlying Oceania group is intentionally left unclassified.
export const CONTINENT_LABELS = {
  AF: "África",
  AS: "Ásia",
  EU: "Europa",
  NA: "América do Norte",
  SA: "América do Sul",
  OC: "Oceânia",
  AN: "Antártida",
  UNKNOWN: "Sem classificação",
} as const;
export type Continent = keyof typeof CONTINENT_LABELS;
const regions: Record<Exclude<Continent, "UNKNOWN">, string> = {
  AF: "AO,BF,BI,BJ,BW,CD,CF,CG,CI,CM,CV,DJ,DZ,EA,EG,EH,ER,ET,GA,GH,GM,GN,GQ,GW,IC,IO,KE,KM,LR,LS,LY,MA,MG,ML,MR,MU,MW,MZ,NA,NE,NG,RE,RW,SC,SD,SH,SL,SN,SO,SS,ST,SZ,TD,TF,TG,TN,TZ,UG,YT,ZA,ZM,ZW",
  AS: "AE,AF,AM,AZ,BD,BH,BN,BT,CN,CY,GE,HK,ID,IL,IN,IQ,IR,JO,JP,KG,KH,KP,KR,KW,KZ,LA,LB,LK,MM,MN,MO,MV,MY,NP,OM,PH,PK,PS,QA,SA,SG,SY,TH,TJ,TL,TM,TR,TW,UZ,VN,YE",
  EU: "AD,AL,AT,AX,BA,BE,BG,BY,CH,CQ,CZ,DE,DK,EE,ES,FI,FO,FR,GB,GG,GI,GR,HR,HU,IE,IM,IS,IT,JE,LI,LT,LU,LV,MC,MD,ME,MK,MT,NL,NO,PL,PT,RO,RS,RU,SE,SI,SJ,SK,SM,UA,VA,XK",
  NA: "AG,AI,AW,BB,BL,BM,BQ,BS,BZ,CA,CR,CU,CW,DM,DO,GD,GL,GP,GT,HN,HT,JM,KN,KY,LC,MF,MQ,MS,MX,NI,PA,PM,PR,SV,SX,TC,TT,US,VC,VG,VI",
  SA: "AR,BO,BR,BV,CL,CO,EC,FK,GF,GS,GY,PE,PY,SR,UY,VE",
  OC: "AS,AU,CC,CK,CX,FJ,FM,GU,HM,KI,MH,MP,NC,NF,NR,NU,NZ,PF,PG,PN,PW,SB,TK,TO,TV,UM,VU,WF,WS",
  AN: "AQ",
};
const continentByCountry = new Map<string, Continent>();
for (const [continent, countries] of Object.entries(regions)) {
  for (const country of countries.split(","))
    continentByCountry.set(country, continent as Continent);
}
export const continentForCountry = (country: string): Continent =>
  continentByCountry.get(country) ?? "UNKNOWN";
