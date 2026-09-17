'use strict';
/**
 * TANGAZO - the Brand Brain.
 * A brand profile is the single source of truth every agent reads before it
 * writes a word. Multi-brand by design: run your own business and client
 * businesses side by side from the same app.
 */

function blankBrand(name) {
  return {
    name: name || 'New brand',
    legalName: '',
    tagline: '',
    oneLiner: '',
    country: 'Tanzania',
    city: '',
    languages: ['English', 'Swahili'],
    currency: 'TZS',

    // identity
    colors: [],            // [{name, hex, use}]
    fonts: { heading: '', body: '' },
    logoNotes: '',
    visualStyle: '',
    photographyStyle: '',

    // voice
    tone: '',
    voiceRules: [],        // ["Never use exclamation marks", ...]
    bannedWords: [],
    slogans: [],
    proofPoints: [],       // ["10 years in business", "ISO certified"]

    // commercial
    positioning: '',
    differentiators: [],
    products: [],          // [{name, description, price, unit, hero}]
    personas: [],          // [{name, role, painPoints, triggers, objections, channel, message}]
    competitors: [],       // [{name, handle, notes}]

    // channels
    channels: {
      instagram: { handle: '', active: true, notes: '' },
      facebook:  { handle: '', active: true, notes: '' },
      tiktok:    { handle: '', active: true, notes: '' },
      linkedin:  { handle: '', active: true, notes: '' },
      whatsapp:  { number: '', active: true, notes: '' }
    },

    // rules
    postingCadence: 'Instagram 5/wk, Facebook 5/wk, TikTok 4/wk, LinkedIn 3/wk',
    hashtagSets: [],       // [{name, tags}]
    cta: '',
    complianceNotes: '',

    goals: ''
  };
}

/** Zora Holdings, pre-filled from what we already know. Editable in the app. */
function zoraSeed() {
  const b = blankBrand('Zora Holdings');
  Object.assign(b, {
    legalName: 'Zora Holdings Company Limited',
    tagline: 'Milango imara. Nyumba ya kifahari.',
    oneLiner: 'Decorative embossed steel door panels and builders hardware, supplied across Tanzania.',
    country: 'Tanzania',
    city: 'Dar es Salaam',
    currency: 'TZS',

    colors: [
      { name: 'Steel Charcoal', hex: '#22262B', use: 'Backgrounds, headlines' },
      { name: 'Zora Gold', hex: '#C9A227', use: 'Accents, CTA, price tags' },
      { name: 'Off White', hex: '#F4F2ED', use: 'Body text on dark, clean space' }
    ],
    fonts: { heading: 'Montserrat SemiBold', body: 'Inter Regular' },
    visualStyle: 'Bold, architectural, high contrast. Product shot large and centred, generous negative space, gold rule lines. No clip art, no stock smiling office people.',
    photographyStyle: 'Hard directional light raking across the embossed panel so the relief pattern reads. Real Tanzanian houses, gates and hardware shop counters. Shot on a plain wall or at the doorway, never a fake studio backdrop.',

    tone: 'Confident, practical, respectful. Talks like a supplier who knows the trade, not a lifestyle brand. Swahili and English mixed naturally the way Dar traders speak.',
    voiceRules: [
      'Lead with the product benefit, not the adjective.',
      'Always give a reason to act: stock, price, delivery or warranty.',
      'Speak to the buyer by trade (fundi, contractor, shop owner, mwenye nyumba).',
      'Prices in TZS, quantities in real units (panels, pieces, cartons).',
      'Never promise a delivery time the warehouse cannot keep.'
    ],
    bannedWords: ['cheap', 'best in the world', 'revolutionary'],
    slogans: ['Milango imara, maisha salama.', 'Built to be seen. Built to last.'],
    proofPoints: [
      'Imported and stocked locally - no 8-week wait',
      'Embossed steel, not printed finish',
      'Trade pricing for hardware shops and contractors'
    ],

    positioning: 'The stocked, trade-priced source for decorative steel door panels and hardware in Tanzania - so a contractor never stalls a build waiting for an import.',
    differentiators: [
      'Stock held in country, ready to collect',
      'Full hardware range around the door: panels, hinges, sliding bolts, cutting discs, cabinet hinges',
      'Trade terms for repeat buyers'
    ],

    products: [
      { name: 'Embossed steel door panels', description: 'Decorative pressed steel door panels in multiple patterns and finishes.', price: '', unit: 'per panel', hero: true },
      { name: 'Door hinges', description: 'Heavy duty steel door hinges.', price: '', unit: 'per piece', hero: false },
      { name: 'Sliding bolts', description: 'Steel sliding bolts / tower bolts for doors and gates.', price: '', unit: 'per piece', hero: false },
      { name: 'Cabinet hinges', description: 'Concealed and standard cabinet hinges for furniture makers.', price: '', unit: 'per piece', hero: false },
      { name: 'Cutting discs', description: 'Abrasive cutting discs for steel fabrication.', price: '', unit: 'per piece / per box', hero: false }
    ],

    personas: [
      {
        name: 'Hardware shop owner',
        role: 'Buys to resell from a shop in Kariakoo, Mwanza, Arusha',
        painPoints: 'Ties up cash in stock that moves slowly; suppliers run out mid-season',
        triggers: 'Margin per panel, consistent restock, credit terms',
        objections: 'Will it sell? What is my margin? Can I get more next week?',
        channel: 'WhatsApp, Facebook',
        message: 'Stock that turns. Trade price, consistent supply, restock in days not months.'
      },
      {
        name: 'Contractor / fundi',
        role: 'Building or fitting out houses and shops',
        painPoints: 'Site delays waiting on imported doors; client changes the design late',
        triggers: 'Availability today, pattern choice, price per unit on a 20-door job',
        objections: 'Is it in stock now? Does it fit standard frames? What does it cost at volume?',
        channel: 'WhatsApp, TikTok, Facebook',
        message: 'In stock in Dar. Collect today, keep the site moving.'
      },
      {
        name: 'Homeowner (mwenye nyumba)',
        role: 'Building or upgrading a family home',
        painPoints: 'Wants the house to look finished and secure without overspending',
        triggers: 'How the door looks from the street; security; a price they can plan around',
        objections: 'Will it rust? Is it strong? Can my fundi fit it?',
        channel: 'Instagram, TikTok, Facebook',
        message: 'The first thing people see is your door. Make it say the house is finished.'
      },
      {
        name: 'Architect / interior designer',
        role: 'Specifies materials for residential and commercial projects',
        painPoints: 'Needs specifiable, repeatable products with real lead times',
        triggers: 'Pattern catalogue, finishes, dimensions, sample availability',
        objections: 'Can I get a spec sheet? Is the finish consistent across a batch?',
        channel: 'LinkedIn, Instagram',
        message: 'A specifiable local door panel range with samples and consistent batches.'
      }
    ],

    competitors: [],

    channels: {
      instagram: { handle: '', active: true, notes: 'Product beauty, pattern catalogue, before/after doorways' },
      facebook:  { handle: '', active: true, notes: 'Where the trade buyers actually are in TZ. Offers, stock alerts, Marketplace-style posts' },
      tiktok:    { handle: '', active: true, notes: 'Fundi content, install clips, "which door would you pick" polls' },
      linkedin:  { handle: '', active: true, notes: 'Architects, developers, distribution partners' },
      whatsapp:  { number: '', active: true, notes: 'Primary sales channel. Every campaign must end in a WhatsApp message.' }
    },

    postingCadence: 'Instagram 5/wk, Facebook 5/wk, TikTok 4/wk, LinkedIn 2/wk, WhatsApp broadcast 1/wk',
    hashtagSets: [
      { name: 'Core TZ', tags: ['#Tanzania', '#DarEsSalaam', '#Ujenzi', '#Milango', '#SteelDoors'] },
      { name: 'Trade', tags: ['#Hardware', '#Contractor', '#Fundi', '#BuildingMaterials', '#Wholesale'] },
      { name: 'Home', tags: ['#HomeDesign', '#NyumbaYangu', '#InteriorDesignTZ', '#HomeBuildingTZ'] }
    ],
    cta: 'WhatsApp us for today\'s price and stock.',
    complianceNotes: 'Never state a price or a stock number that has not been confirmed by the warehouse. Use "ask for today\'s price" when unsure.',
    goals: 'Move imported panel stock fast, build a repeat trade-buyer base among hardware shops and contractors, and grow towards full distributorship.'
  });
  return b;
}

/** Compact text form of a brand, injected into every agent prompt. */
function brandBrief(brand) {
  if (!brand) return '(no brand selected)';
  const L = [];
  const push = (label, v) => { if (v && String(v).trim()) L.push(label + ': ' + v); };

  push('BRAND', brand.name + (brand.legalName ? ' (' + brand.legalName + ')' : ''));
  push('What it is', brand.oneLiner);
  push('Tagline', brand.tagline);
  push('Market', [brand.city, brand.country].filter(Boolean).join(', '));
  push('Languages', (brand.languages || []).join(', '));
  push('Currency', brand.currency);
  push('Positioning', brand.positioning);
  if ((brand.differentiators || []).length) L.push('Differentiators:\n' + brand.differentiators.map(d => '  - ' + d).join('\n'));
  if ((brand.proofPoints || []).length) L.push('Proof points:\n' + brand.proofPoints.map(d => '  - ' + d).join('\n'));

  push('Tone of voice', brand.tone);
  if ((brand.voiceRules || []).length) L.push('Voice rules:\n' + brand.voiceRules.map(d => '  - ' + d).join('\n'));
  if ((brand.bannedWords || []).length) push('Never use these words', brand.bannedWords.join(', '));
  if ((brand.slogans || []).length) push('Slogans', brand.slogans.join(' | '));

  if ((brand.colors || []).length) {
    L.push('Colours:\n' + brand.colors.map(c => '  - ' + c.name + ' ' + c.hex + (c.use ? ' (' + c.use + ')' : '')).join('\n'));
  }
  if (brand.fonts && (brand.fonts.heading || brand.fonts.body)) {
    push('Fonts', 'heading ' + (brand.fonts.heading || '-') + ', body ' + (brand.fonts.body || '-'));
  }
  push('Visual style', brand.visualStyle);
  push('Photography style', brand.photographyStyle);
  push('Logo notes', brand.logoNotes);

  if ((brand.products || []).length) {
    L.push('Products:\n' + brand.products.map(p =>
      '  - ' + p.name + (p.hero ? ' [HERO]' : '') + (p.price ? ' - ' + p.price + (p.unit ? ' ' + p.unit : '') : '') +
      (p.description ? ' - ' + p.description : '')).join('\n'));
  }

  if ((brand.personas || []).length) {
    L.push('Customer personas:\n' + brand.personas.map(p =>
      '  - ' + p.name + ' | role: ' + (p.role || '-') +
      ' | pains: ' + (p.painPoints || '-') +
      ' | buying triggers: ' + (p.triggers || '-') +
      ' | objections: ' + (p.objections || '-') +
      ' | best channel: ' + (p.channel || '-') +
      (p.message ? ' | core message: ' + p.message : '')).join('\n'));
  }

  if ((brand.competitors || []).length) {
    L.push('Competitors:\n' + brand.competitors.map(c => '  - ' + c.name + (c.handle ? ' (' + c.handle + ')' : '') + (c.notes ? ' - ' + c.notes : '')).join('\n'));
  }

  const ch = brand.channels || {};
  const chLines = Object.keys(ch)
    .filter(k => ch[k] && ch[k].active !== false)
    .map(k => '  - ' + k + (ch[k].handle ? ' ' + ch[k].handle : '') + (ch[k].number ? ' ' + ch[k].number : '') + (ch[k].notes ? ' - ' + ch[k].notes : ''));
  if (chLines.length) L.push('Active channels:\n' + chLines.join('\n'));

  push('Posting cadence', brand.postingCadence);
  if ((brand.hashtagSets || []).length) {
    L.push('Hashtag sets:\n' + brand.hashtagSets.map(h => '  - ' + h.name + ': ' + (h.tags || []).join(' ')).join('\n'));
  }
  push('Default call to action', brand.cta);
  push('Compliance rules', brand.complianceNotes);
  push('Business goals', brand.goals);

  return L.join('\n');
}

function activeChannels(brand) {
  const ch = (brand && brand.channels) || {};
  return Object.keys(ch).filter(k => ch[k] && ch[k].active !== false);
}

module.exports = { blankBrand, zoraSeed, brandBrief, activeChannels };
