# AI Concierge — Website Content Guidelines

The AI Concierge uses the Marina Square website as its knowledge base. How content is structured on the website directly impacts the quality of the chatbot's answers. Below are recommendations to help the AI return accurate, up-to-date information.

---

## 1. Always Include Dates with Year

**Problem:** When events or promotions only show "9 to 14 July" without a year, the AI cannot tell if it's current or from a past year.

**Do:**
- "9 to 14 July **2026**"
- "Valid from 1 June **2026** to 31 August **2026**"

**Don't:**
- "9 to 14 July" (no year)
- "Valid from 1 to 31 October" (which October?)

---

## 2. Include Dates on Every Promotion Page

**Problem:** Some promotion pages list store deals (e.g., "VitaKids Buy 1 Free 1") without any validity dates. The AI cannot determine if these are current.

**Do:**
- Add a clear validity period at the top of every promotion article: *"Valid from 1 June 2026 to 31 December 2026"*
- Include the date next to each individual store deal if they have different validity periods

**Don't:**
- List deals with no dates — the AI will either skip them (too cautious) or present expired ones as current (too loose)

---

## 3. Remove or Archive Expired Content

**Problem:** Old event and promotion pages (e.g., "School Break Specials Aug-Sep 2024") remain on the website. The AI indexes everything and may surface expired deals that look like permanent offers.

**Do:**
- Remove expired promotion articles from the website, OR
- Move them to an archive section with a clear "EXPIRED" label and past dates
- Update the "Upcoming Events" page promptly when events end

**Don't:**
- Leave expired promotion pages live with no indication they've ended
- Keep old event pages with dates removed (the AI treats dateless content as potentially current)

---

## 4. Use a Single "Current Promotions" Page

**Problem:** Promotions are spread across many separate article pages. Some are current, some expired. The AI picks up snippets from random pages without context.

**Recommended format — one page with all current promotions:**

```
Current Mall Promotions
Valid from 1 June 2026 to 31 December 2026

DINING DEALS
- Suki-Ya (#02-183B/183C): Kids dine free with every 1 paying adult.
  Valid: 1 June 2026 – 31 December 2026
- Lam Heung Ling (#02-280): Buy 2 drinks, get 2nd at 50% off (2pm-9pm).
  Valid: 1 June 2026 – 31 December 2026

SHOPPING DEALS
- VitaKids (#03-152): Buy 1 Free 1 on selected products.
  Valid: 1 June 2026 – 31 December 2026
```

This format works best because:
- All promotions are in one place (the AI finds them in a single search)
- Each deal has its own validity date (the AI can filter expired ones individually)
- Store names and unit numbers help the AI give directions

---

## 5. Event Page Format

The current "Upcoming Events" page format works well. Keep it as-is:

```
Upcoming Events – July 2026

CTC Travel Fair
4 to 5 July 2026
Central Atrium

Beyblade SEA Cup 2026
7 to 13 July 2026
Marina Foyer Atrium & Marina Foyers
```

**Key:** Always include the **year** with every date, and **remove past events** from this page after they end.

---

## 6. Store Directory

- Keep the store directory page (`/stores`) up to date
- When a tenant closes or a pop-up ends, remove it promptly
- The AI uses this as the source of truth for "what stores are in the mall"

---

## 7. Category Pages (Entertainment, Dining, Shopping, etc.)

**Problem:** When users ask "what entertainment is available?", the AI searches for pages containing "entertainment". It finds scattered mentions across old articles, event pages, and closed tenant descriptions — mixing current and outdated results.

**Recommended:** Maintain dedicated category pages that list only current tenants. Examples:

**Entertainment:**
```
Entertainment at Marina Square

Timezone (#02-142/143)
Family interactive entertainment centre with state-of-the-art games and prizes.

Club Shine (#03-xxx)
Live music, drinks, and nightlife entertainment.

#RAVE Karaoke (#02-xxx)
Karaoke venue for friends and families.

Kids In The Room (#03-xxx)
Educational escape room concept for children.

Lockdown Escape (#03-149/150/151)
Escape room adventure experiences.

Mofunland (#02-xxx)
Singapore's first kid's cubing theme playground.

Matchpoint Inc (#02-xxx)
Singapore's first Tennis Virtual Simulator.
```

**Dining:**
```
Dining at Marina Square

Suki-Ya @ The Dining Edition (#02-183B/183C)
Shabu Shabu hotpot restaurant.

Kanada-Ya (#02-203/204)
Authentic Japanese ramen.

Sofra Turkish Cafe & Restaurant (#03-129A)
Turkish cuisine and cafe.
```

**Why this helps:**
- The AI finds one authoritative page per category instead of scattered mentions
- Closed tenants are removed from the category page immediately — no stale results
- Unit numbers help the AI give wayfinding directions
- When a new tenant opens or one closes, update the single category page

**Key rule:** When a tenant closes, remove it from the category page. Don't leave it listed — the AI treats everything on the page as current.
