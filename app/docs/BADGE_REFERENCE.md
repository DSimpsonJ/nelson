# Nelson Badge Reference Designs
**Locked:** March 29, 2026
**Status:** Canonical. Do not modify without design sign-off.

---

## Brand Colors
- Amber: `#F59E0B`
- Amber light (highlight): `#FDE68A`
- Shield background (phase): `#0d1220`
- Shield background (gold/identity): `#1e0f00`
- Back face text color: `#0d1220`

---

## Shield Shape (Standard — all badges)
```svg
<path d="M20,8 C20,3 25,0 32,0 L168,0 C175,0 180,3 180,8 L180,130 C180,172 100,200 100,200 C100,200 20,172 20,130 Z"/>
```

## Inner Ring (Standard)
```svg
<path d="M28,12 C28,8 32,6 38,6 L162,6 C168,6 172,8 172,12 L172,128 C172,168 100,192 100,192 C100,192 28,168 28,128 Z"/>
```

---

## Reference Badge 1: Activation (Phase 2)
**Use as template for all phase badges.**

- Shield fill: `#0d1220`
- Shield stroke: `#F59E0B` 2.5px
- Inner ring stroke: `#F59E0B` 1px opacity 0.3
- Bolt fill: `#F59E0B`
- Bolt outline stroke: `#FDE68A` 2px stroke-linejoin="round"
- Top highlight triangle fill: `#FDE68A` opacity 0.3
- Bottom highlight sliver fill: `#FDE68A` opacity 0.2

### Bolt Path
```svg
<path d="M105,28 L65,106 L88,106 L78,172 L116,94 L93,94 L118,28 Z"
      fill="#F59E0B"/>
<path d="M105,28 L65,106 L88,106 L78,172 L116,94 L93,94 L118,28 Z"
      fill="none" stroke="#FDE68A" stroke-width="2"
      stroke-linejoin="round" stroke-linecap="round"/>
<path d="M105,28 L93,94 L118,28 Z" fill="#FDE68A" opacity="0.3"/>
<path d="M88,106 L78,172 L82,172 L91,110 Z" fill="#FDE68A" opacity="0.2"/>
```

### Label (below shield, not inside)
```svg
<text x="100" y="228" text-anchor="middle"
      font-family="system-ui,-apple-system,sans-serif"
      font-size="14" font-weight="600" fill="#F59E0B" letter-spacing="2">ACTIVATION</text>
<text x="100" y="248" text-anchor="middle"
      font-family="system-ui,-apple-system,sans-serif"
      font-size="12" font-weight="400" fill="#F59E0B" opacity="0.5" letter-spacing="1">PHASE 2</text>
```

---

## Reference Badge 2: Identity (100 Check-ins)
**Use as template for all milestone badges.**

- Shield fill: `#1e0f00`
- Shield stroke: `#F59E0B` 3px
- Outer glow ring: `#F59E0B` 1px opacity 0.2 (path slightly larger than shield)
- Inner ring 1 stroke: `#FDE68A` 1.5px opacity 0.6
- Inner ring 2 stroke: `#F59E0B` 0.75px opacity 0.3

### Outer Glow Ring Path
```svg
<path d="M14,8 C14,2 20,0 28,0 L132,0 C140,0 146,2 146,8 L146,114 C146,154 80,184 80,184 C80,184 14,154 14,114 Z"
      fill="none" stroke="#F59E0B" stroke-width="1" opacity="0.2"/>
```

### Inner Ring 1
```svg
<path d="M28,12 C28,8 32,6 38,6 L122,6 C128,6 132,8 132,12 L132,108 C132,144 80,170 80,170 C80,170 28,144 28,108 Z"
      fill="none" stroke="#FDE68A" stroke-width="1.5" opacity="0.6"/>
```

### Inner Ring 2
```svg
<path d="M36,18 C36,14 39,12 44,12 L116,12 C121,12 124,14 124,18 L124,106 C124,138 80,162 80,162 C80,162 36,138 36,106 Z"
      fill="none" stroke="#F59E0B" stroke-width="0.75" opacity="0.3"/>
```

### Sunburst Rays (12 total)
```svg
<line x1="80" y1="6"    x2="80" y2="20"   stroke="#FDE68A" stroke-width="2"    stroke-linecap="round" opacity="0.65"/>
<line x1="18" y1="60"   x2="30" y2="60"   stroke="#FDE68A" stroke-width="2"    stroke-linecap="round" opacity="0.65"/>
<line x1="130" y1="60"  x2="142" y2="60"  stroke="#FDE68A" stroke-width="2"    stroke-linecap="round" opacity="0.65"/>
<line x1="80" y1="148"  x2="80" y2="160"  stroke="#FDE68A" stroke-width="2"    stroke-linecap="round" opacity="0.5"/>
<line x1="28" y1="22"   x2="38" y2="32"   stroke="#FDE68A" stroke-width="1.75" stroke-linecap="round" opacity="0.55"/>
<line x1="132" y1="22"  x2="122" y2="32"  stroke="#FDE68A" stroke-width="1.75" stroke-linecap="round" opacity="0.55"/>
<line x1="28" y1="100"  x2="38" y2="90"   stroke="#FDE68A" stroke-width="1.75" stroke-linecap="round" opacity="0.5"/>
<line x1="132" y1="100" x2="122" y2="90"  stroke="#FDE68A" stroke-width="1.75" stroke-linecap="round" opacity="0.5"/>
<line x1="20" y1="40"   x2="28" y2="46"   stroke="#FDE68A" stroke-width="1.25" stroke-linecap="round" opacity="0.35"/>
<line x1="140" y1="40"  x2="132" y2="46"  stroke="#FDE68A" stroke-width="1.25" stroke-linecap="round" opacity="0.35"/>
<line x1="20" y1="80"   x2="28" y2="74"   stroke="#FDE68A" stroke-width="1.25" stroke-linecap="round" opacity="0.35"/>
<line x1="140" y1="80"  x2="132" y2="74"  stroke="#FDE68A" stroke-width="1.25" stroke-linecap="round" opacity="0.35"/>
```

### Numeral + Rule + Sub-label
```svg
<text x="80" y="78" text-anchor="middle"
      font-family="system-ui,-apple-system,sans-serif"
      font-size="58" font-weight="700" fill="#F59E0B" letter-spacing="-2">100</text>
<line x1="40" y1="92" x2="120" y2="92" stroke="#FDE68A" stroke-width="0.75" opacity="0.4"/>
<text x="80" y="112" text-anchor="middle"
      font-family="system-ui,-apple-system,sans-serif"
      font-size="11" font-weight="500" fill="#FDE68A" letter-spacing="2.5" opacity="0.8">CHECK-INS</text>
```

### Label (below shield)
```svg
<text x="80" y="206" text-anchor="middle"
      font-family="system-ui,-apple-system,sans-serif"
      font-size="13" font-weight="600" fill="#FDE68A" letter-spacing="2">IDENTITY</text>
<text x="80" y="224" text-anchor="middle"
      font-family="system-ui,-apple-system,sans-serif"
      font-size="11" font-weight="400" fill="#FDE68A" opacity="0.5" letter-spacing="1">100 CHECK-INS</text>
```

---

## Badge Back Face (All Phases)
**File:** `app/components/BadgeUnlockScreen.tsx` — `BadgeBackFace` component

- Back face is counter-mirrored: `transform: [{ scaleX: -1 }]` on wrapping View
- Fill: `url(#goldShimmer)` linear gradient diagonal (x1=0 y1=0 x2=1 y2=1)
  - Stop 0%: `#92610A`
  - Stop 25%: `#F59E0B`
  - Stop 50%: `#FDE68A`
  - Stop 75%: `#F59E0B`
  - Stop 100%: `#92610A`
- Border stroke: `#FDE68A` strokeWidth={6}
- Inner ring stroke: `white` strokeWidth={1.5} opacity={0.4}
- Text fill: `#0d1220` (matches front shield background)
- Phase name font size: 15px if name > 9 chars, 18px otherwise
- Phase number font size: 11px, letterSpacing={2}, opacity={0.9}

---

## BadgeUnlockScreen Animation Specs
**File:** `app/components/BadgeUnlockScreen.tsx`
**Status:** Locked and working on device.

- Entry: `withSpring` slide up from y=400, damping=18, stiffness=200, mass=1
- Rotation: `withRepeat(withTiming(360, { duration: 4000, easing: Easing.linear }), -1, false)`
- Rotation delay: 800ms after mount
- Face swap: 16ms interval, show back when `deg > 85 && deg < 265`
- Back face counter-mirror: `transform: [{ scaleX: -1 }]` on wrapping View
- Back face border: `strokeWidth={6}`
- Back face text color: `#0d1220`
- Back face fill: `url(#goldShimmer)` linear gradient -- stops: #92610A → #F59E0B → #FDE68A → #F59E0B → #92610A
- Accent color: `#F59E0B` for all phases, `#FDE68A` for Identity
- Continue button: transparent bg, 1.5px border, amber `accentColor`, paddingHorizontal=48

---

## Deferred Badge Designs (post-launch)
Phase icons to design per phase -- agreed directions:
- Initiation: single dot or seed
- Activation: bolt (locked above)
- Patterning: three horizontal lines (rhythm/signal)
- Integration: two linked elements (chain links)
- Accumulation: stacked bars building upward
- Consolidation: solid filled circle (mass/density)
- Resilience: broken line that rejoins
- Identity: full sunburst

Zone badges (deferred -- need retention data):
- Zone Dweller: 7 days in The Zone
- Flywheel: 30 days in The Zone

Comeback badge (Resilience mechanic -- deferred):
- Trigger: check-in after 3+ day gap with momentum recovery

Milestone badges using Identity template:
- 10, 25, 50, 100 check-ins

---

## Known Limitation
All non-Identity phase badges currently render `ActivationBadge` (bolt).
Remaining 7 phase-specific icons are deferred -- build per the icon directions above.