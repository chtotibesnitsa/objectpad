/**
 * NSFW / adult detector shared by the web app and the backend.
 * Any coin can launch on ObjectPad; this only decides whether it lists in the 18+ tab instead of the main market.
 * Text is normalised (lowercase, accents, leetspeak, repeated letters) and matched as whole words, as safe word
 * prefixes ("weedcombo", "dildos", "pornstar") and as unambiguous substrings of short fields ("big-dildo-coin").
 */

const list = (s: string): string[] => s.split(/\s+/).filter(Boolean);

/** Whole words only, so "canal", "analog", "cockpit", "method", "scunthorpe" never match. */
const EXACT = new Set(list(`
anal anus arse ass asses asshole assholes arsehole booty boob boobs boobies butthole cum cums cumming cumshot cummy
dick dicks dickhead cock cocks cocksucker prick pricks knobhead bellend wanker wankers twat twats cunt cunts
pussy pussies vagina vaginas penis penises dildo dildos vibrator vibrators buttplug buttplugs strapon fleshlight
tit tits titty titties nipple nipples nip nips clit clits clitoris labia vulva scrotum ballsack nutsack testicle testicles
schlong wiener weiner phallus phallic erection erections boner boners hardon semen sperm jizz jism spunk
sex sexy sexual sexting sext sextoy sextoys nude nudes nudity naked nsfw xxx porn porno porns pornstar smut lewd lewds
horny orgasm orgasms orgy orgies masturbate masturbating fap faps fapping wank wanking jerkoff jackoff circlejerk
blowjob blowjobs handjob handjobs footjob rimjob deepthroat bukkake creampie gangbang squirt squirting pegging fisting
bdsm bondage kinky fetish fetishes dominatrix femdom milf milfs dilf gilf thot thots slut sluts slutty whore whores skank
hooker hookers stripper strippers escort escorts onlyfans fansly chaturbate pornhub xvideos xhamster brazzers redtube
youporn stripchat camgirl camgirls camboy sugardaddy sugarbaby hentai ecchi ahegao futa futanari yiff erotic erotica
lingerie thong thongs panties topless bussy thicc thiccc pawg bbc queef chode gooch taint
goon goons gooner gooners gooning goonmaxxing coomer coom
rape raped rapes rapist raping molest molester molesting incest pedo pedos pedophile loli lolicon shota shotacon
weed weeds kush ganja marijuana cannabis reefer doobie spliff spliffs bong bongs stoner stoned shrooms psilocybin
lsd mdma ecstasy xtc cocaine crackhead heroin fentanyl ketamine meth methamphetamine xanax adderall oxy oxycodone
percocet percs codeine thc 420 opium junkie narco narcos
nigger niggers nigga niggas faggot faggots fag fags tranny trannies retard retards kike kikes spic chink wetback
nazi nazis hitler kkk fuck fucks fucked fucker fucking motherfucker bitch bitches shit shitcoin
`));

/** Word prefixes that are safe to match at any length ("weedcombo", "dildoking", "pornhubber", "goonsquad"). */
const PREFIX = list(`
dildo porn hentai penis vagina pussy weed goon gooner jizz cunt slut whore fuck phuck fuk motherf milf nsfw xxx
orgasm orgy horny sexy sexting sextoy blowjob handjob rimjob boner erotic lewd hooker stripper onlyfans fleshlight
vibrator strapon buttplug ballsack nutsack scrotum testicl clitor semen sperm bukkake creampie gangbang deepthroat
masturbat fetish bdsm bondage dominatrix futanari ahegao incest pedophil lolicon rapist molest nigg faggot tranny
cocaine heroin fentanyl ketamine methamph crackhead stoner kush ganja marijuana cannabis spliff psilocyb mdma xanax
adderall oxycod percocet hitler nazi boob titty tittie cumshot cumslut cocksuck dickhead asshole butthole jerkoff
`);

/** Unambiguous strings matched inside short fields once separators are removed ("big-dildo-coin" -> "bigdildocoin"). */
const ANYWHERE = list(`
dildo porn hentai penis vagina blowjob handjob rimjob buttplug fleshlight vibrator strapon onlyfans pornhub xvideos
xhamster brazzers chaturbate bukkake creampie gangbang deepthroat cumshot cumslut cocksuck fuck masturbat orgasm
ejaculat boobies titties pussy clitoris testicle ballsack nutsack scrotum sextoy sexting nudes nsfw xxx milf futanari
ahegao dominatrix bondage fetish nigger nigga faggot tranny incest pedophil lolicon marijuana cannabis cocaine fentanyl
ketamine crackhead psilocybin mdma xanax percocet oxycodone gooner gooning hitler weedcoin weedcombo weedtoken
`);

/** Obfuscated spellings (symbols inside the word). */
const PATTERNS: RegExp[] = [
  /d[i1!|]+l+d[o0]+/i, /p[e3]n[i1!|]s/i, /p[o0]rn/i, /f[u*v]ck/i, /v[a@4]g[i1!|]n[a@4]/i, /\bd[i1!*]cks?\b/i, /\bp[u*]ss[y*]/i,
  /\bn[i1!]gg/i, /\b[a@4]n[a@4]l\b/i, /\bw[e3]{2,}d(?!ing|er|ed|s? ?kill)/i, /\bg[o0]{2,}n/i, /\bc[u*]m\b/i, /\bsl[u*]ts?\b/i, /\bs[e3]xy?\b/i,
  /\b(18|21)\s*\+/, /\badults?[\s-]+(only|toys?|content)\b/i, /\bsex[\s-]*toys?\b/i, /\bt[i1!]tt?[i1!]es\b/i,
];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b', '9': 'g' };
const ANY_RE = new RegExp(ANYWHERE.join('|'));

function wordsOf(text: string): string[] {
  const lower = text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return lower.split(/[^a-z0-9!|@$+]+/).filter(Boolean).map(w => (/^\d+$/.test(w) ? w : w.replace(/[0-9!|@$+]/g, c => LEET[c] ?? c)));
}

/** Everyday words that share a prefix with an adult word. */
const SAFE = new Set(list('weeding weeder weeded weedkiller weedwacker weedeater penistone sexton sextant cockpit cockatoo cockatiel cockroach cockerel')); 

function wordHit(w: string): boolean {
  if (SAFE.has(w)) return false;
  const squeezed = w.replace(/(.)\1+/g, '$1');
  if (EXACT.has(w) || EXACT.has(squeezed)) return true;
  if (PREFIX.some(p => w.startsWith(p) || squeezed.startsWith(p))) return true;
  return ANY_RE.test(w);
}

/** True when any of the given texts (name, ticker, story, AI object name…) reads as NSFW/adult. */
export function isNsfwText(...texts: (string | null | undefined)[]): boolean {
  for (const text of texts) {
    if (typeof text !== 'string' || !text.trim()) continue;
    if (PATTERNS.some(p => p.test(text))) return true;
    const words = wordsOf(text);
    if (words.some(wordHit)) return true;
    // Spaced-out letters ("d i l d o", "d.i.l.d.o"): check with separators removed.
    if (words.length >= 3 && words.filter(w => w.length <= 2).length >= words.length - 1 && ANY_RE.test(words.join(''))) return true;
  }
  return false;
}

/** Minimal coin shape the detector reads; `nsfw` is the server/AI verdict when present. */
export interface NsfwCandidate { nsfw?: boolean | null; name?: string | null; symbol?: string | null; objectName?: string | null; story?: string | null; }
/** True when the server/AI flagged the coin or its public text matches the keyword lists. */
export function isNsfwCoin(c: NsfwCandidate): boolean { return c.nsfw === true || isNsfwText(c.name, c.symbol, c.objectName, c.story); }
