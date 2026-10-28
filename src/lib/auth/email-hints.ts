/**
 * Small kindnesses on the email step: catching "gmial.com" before a sign-in link is sent
 * into the void, and offering a shortcut to the right inbox afterwards.
 */

const COMMON_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.co.uk",
  "live.com",
  "yahoo.com",
  "yahoo.co.uk",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
];

/** Real providers that sit one letter away from a common one, and must never be "corrected". */
const REAL_DOMAINS = new Set([
  "mail.com", "email.com", "gmx.com", "gmx.de", "gmx.net", "web.de", "ymail.com", "msn.com", "live.co.uk",
  "outlook.fr", "hotmail.fr", "yahoo.fr", "yahoo.de", "qq.com", "163.com", "126.com", "naver.com", "mail.ru",
  "yandex.ru", "zoho.com", "fastmail.com", "pm.me", "tutanota.com", "mac.com", "aim.com",
]);

const TLD_TYPOS: Record<string, string> = { con: "com", cmo: "com", ocm: "com", comm: "com", vom: "com", xom: "com", eud: "edu", ed: "edu" };

/** Edit distance with adjacent swaps counted as one edit ("gmial" is one slip from "gmail"). */
function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * The address the person probably meant, or null. Only well-known mail providers and
 * misspelt endings are corrected: a university's own domain is never second-guessed.
 */
export function suggestEmail(email: string): string | null {
  const at = email.trim().toLowerCase().lastIndexOf("@");
  if (at < 1) return null;
  const local = email.trim().slice(0, at);
  const domain = email.trim().toLowerCase().slice(at + 1);
  if (!domain.includes(".") || COMMON_DOMAINS.includes(domain) || REAL_DOMAINS.has(domain)) return null;

  let best: string | null = null;
  let bestDistance = 3;
  for (const known of COMMON_DOMAINS) {
    const d = distance(domain, known);
    // One slip in a short name, two in a longer one.
    const allowed = known.length <= 8 ? 1 : 2;
    if (d <= allowed && d < bestDistance) {
      best = known;
      bestDistance = d;
    }
  }
  if (best) return `${local}@${best}`;

  const parts = domain.split(".");
  const fixed = TLD_TYPOS[parts.at(-1)!];
  if (fixed) return `${local}@${[...parts.slice(0, -1), fixed].join(".")}`;
  return null;
}

export type MailApp = { label: string; href: string };

const GMAIL: MailApp = {
  label: "Gmail",
  href: "https://mail.google.com/mail/u/0/#search/AcademiaSync+in%3Aanywhere+newer_than%3A1h",
};
const OUTLOOK_WORK: MailApp = { label: "Outlook", href: "https://outlook.office.com/mail/" };
const PROVIDERS: Record<string, MailApp> = {
  "gmail.com": GMAIL,
  "googlemail.com": GMAIL,
  "outlook.com": { label: "Outlook", href: "https://outlook.live.com/mail/" },
  "hotmail.com": { label: "Outlook", href: "https://outlook.live.com/mail/" },
  "hotmail.co.uk": { label: "Outlook", href: "https://outlook.live.com/mail/" },
  "live.com": { label: "Outlook", href: "https://outlook.live.com/mail/" },
  "yahoo.com": { label: "Yahoo Mail", href: "https://mail.yahoo.com/" },
  "yahoo.co.uk": { label: "Yahoo Mail", href: "https://mail.yahoo.com/" },
  "icloud.com": { label: "iCloud Mail", href: "https://www.icloud.com/mail" },
  "me.com": { label: "iCloud Mail", href: "https://www.icloud.com/mail" },
  "proton.me": { label: "Proton Mail", href: "https://mail.proton.me/" },
  "protonmail.com": { label: "Proton Mail", href: "https://mail.proton.me/" },
};

/**
 * Shortcuts to the inbox the link went to. Universities mostly run Outlook or Gmail
 * under their own domain, so an unknown domain gets both.
 */
export function mailApps(email: string): MailApp[] {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  const known = PROVIDERS[domain];
  return known ? [known] : [OUTLOOK_WORK, GMAIL];
}
