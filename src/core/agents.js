'use strict';
/**
 * TANGAZO - the marketing department.
 * Ten specialist agents. Each one is a system prompt + a JSON contract, so the
 * output is structured data the app can schedule, export and publish - not a
 * wall of chat text.
 */

const { brandBrief, activeChannels } = require('./brands');

const HOUSE_RULES = `
You are part of TANGAZO, an automated brand marketing department run by a Tanzanian operator.

Non-negotiable rules:
1. Work ONLY from the brand brief given below. Never invent a price, a phone number,
   a stock figure, a certification, an award or a customer testimonial. If a number
   would strengthen the copy but you were not given it, write a placeholder in
   square brackets such as [price] or [stock qty] so a human fills it in.
2. Obey the brand's tone, voice rules and banned words exactly.
3. Write for the real market named in the brief. If the brief lists Swahili as a
   language, mix Swahili and English the way people actually speak there - do not
   produce stiff textbook Swahili or translate word for word.
4. Copy must be specific. "Quality products at affordable prices" is a failure.
   Name the product, the buyer, and the reason to act now.
5. Respect platform reality: Instagram is visual and caption-led, Facebook carries
   the trade buyers and offers, TikTok is a spoken hook in the first 2 seconds,
   LinkedIn is professional and evidence-led, WhatsApp is one-to-one and short.
6. Output STRICT JSON matching the requested shape. No markdown, no code fences,
   no commentary before or after the JSON.
`.trim();

function systemFor(brand) {
  return HOUSE_RULES + '\n\n=== BRAND BRIEF ===\n' + brandBrief(brand) + '\n=== END BRAND BRIEF ===';
}

function channelList(brand, override) {
  if (override && override.length) return override;
  const c = activeChannels(brand).filter(x => x !== 'whatsapp');
  return c.length ? c : ['instagram', 'facebook', 'tiktok', 'linkedin'];
}

/* ------------------------------------------------------------------ agents */

const AGENTS = {

  /* 1 -------------------------------------------------------------------- */
  strategist: {
    name: 'Marketing Strategist',
    blurb: 'Turns a business goal into positioning, angles and a plan of attack.',
    icon: 'target',
    inputs: [
      { key: 'goal', label: 'Business goal or situation', type: 'textarea', required: true,
        placeholder: 'e.g. We have 400 embossed door panels arriving. We need them sold in 60 days.' },
      { key: 'budget', label: 'Ad budget (optional)', type: 'text', placeholder: 'e.g. TZS 1,500,000 / month' },
      { key: 'horizon', label: 'Time horizon', type: 'text', placeholder: '30 days' }
    ],
    build: (brand, i) => `
GOAL: ${i.goal}
BUDGET: ${i.budget || 'not stated - assume lean, organic-first'}
HORIZON: ${i.horizon || '30 days'}

Produce a marketing strategy. Return JSON:
{
  "situation": "2-3 sentences on where the brand actually stands against this goal",
  "objective": "one measurable objective for the horizon",
  "targetSegments": [{"persona":"", "whyNow":"", "priority":"high|medium|low", "channel":""}],
  "positioning": "the single sentence this whole push leans on",
  "bigIdea": {"name":"campaign idea name", "premise":"", "why":"why it works on this market"},
  "messagingPillars": [{"pillar":"", "proof":"", "contentAngles":["","",""]}],
  "channelPlan": [{"channel":"", "role":"what this channel is FOR in this push", "cadence":"", "contentMix":""}],
  "offer": {"hook":"", "mechanic":"e.g. trade price on 10+ panels", "urgency":"", "risk":"what could go wrong with this offer"},
  "kpis": [{"metric":"", "target":"", "howMeasured":""}],
  "thirtyDayShape": [{"week":1, "focus":"", "outcome":""}],
  "risks": ["", ""],
  "quickWins": ["things to do in the first 72 hours"]
}`.trim()
  },

  /* 2 -------------------------------------------------------------------- */
  content: {
    name: 'Content Creator',
    blurb: 'Writes the actual posts, captions and hooks for each platform.',
    icon: 'pen',
    inputs: [
      { key: 'topic', label: 'What are we posting about?', type: 'textarea', required: true,
        placeholder: 'e.g. New embossed panel patterns just landed' },
      { key: 'count', label: 'How many posts', type: 'number', default: 10 },
      { key: 'channels', label: 'Channels', type: 'channels' },
      { key: 'persona', label: 'Aim at which persona (optional)', type: 'text' }
    ],
    build: (brand, i) => `
TOPIC: ${i.topic}
HOW MANY: ${i.count || 10} posts total, spread across the channels below.
CHANNELS: ${channelList(brand, i.channels).join(', ')}
${i.persona ? 'AIM AT PERSONA: ' + i.persona : 'Rotate across the brand personas.'}

Write the posts. Every caption must be ready to paste - no "insert X here" except
bracketed placeholders for facts you were not given.

Return JSON:
{
  "posts": [
    {
      "channel": "instagram|facebook|tiktok|linkedin",
      "format": "single image|carousel|reel|story|text|video|document",
      "persona": "which persona this targets",
      "pillar": "which message this carries",
      "hook": "the first line / first 2 seconds",
      "caption": "the full caption, line breaks as \\n, ready to paste",
      "hashtags": ["#..."],
      "cta": "",
      "visualBrief": "what the image or video shows, in one or two sentences",
      "onScreenText": ["text overlay line 1", "line 2"],
      "altText": "accessibility description",
      "bestTime": "e.g. Tue 19:00"
    }
  ]
}`.trim()
  },

  /* 3 -------------------------------------------------------------------- */
  creative: {
    name: 'Creative Director',
    blurb: 'Writes image, poster and video generation prompts on brand.',
    icon: 'camera',
    inputs: [
      { key: 'subject', label: 'What are we making visuals for?', type: 'textarea', required: true,
        placeholder: 'e.g. Hero shots of the new panel patterns + 3 poster layouts' },
      { key: 'count', label: 'How many prompts', type: 'number', default: 8 },
      { key: 'kind', label: 'Kind', type: 'select', options: ['product photo', 'poster / flyer', 'banner / ad creative', 'promotional video', 'mixed'], default: 'mixed' }
    ],
    build: (brand, i) => `
SUBJECT: ${i.subject}
KIND: ${i.kind || 'mixed'}
HOW MANY: ${i.count || 8}

Write generation prompts that would work in an image or video model (Midjourney,
Firefly, Higgsfield, Sora, Veo) AND a layout brief a human designer could follow
in Canva. Prompts must carry the brand's colours, fonts and photography style.

Return JSON:
{
  "prompts": [
    {
      "title": "",
      "kind": "product photo|poster|banner|video",
      "useFor": "which post or ad this feeds",
      "aspect": "1:1|4:5|9:16|16:9",
      "imagePrompt": "the full generation prompt, one paragraph, no bullet points",
      "negativePrompt": "what must not appear",
      "layout": "where the logo, headline, product and CTA sit",
      "headline": "text that goes on the creative",
      "subhead": "",
      "palette": ["#......"],
      "shotNotes": "lens, light, angle - or for video: shot list beat by beat",
      "durationSec": 0
    }
  ]
}`.trim()
  },

  /* 4 -------------------------------------------------------------------- */
  social: {
    name: 'Social Media Manager',
    blurb: 'Builds the posting calendar - what goes out, where, and when.',
    icon: 'calendar',
    inputs: [
      { key: 'theme', label: 'Theme / focus for this period', type: 'textarea', required: true },
      { key: 'days', label: 'How many days', type: 'number', default: 30 },
      { key: 'startDate', label: 'Start date', type: 'date' },
      { key: 'channels', label: 'Channels', type: 'channels' }
    ],
    build: (brand, i) => `
THEME: ${i.theme}
PERIOD: ${i.days || 30} days starting ${i.startDate || 'the next Monday'}
CHANNELS: ${channelList(brand, i.channels).join(', ')}
CADENCE TO RESPECT: ${brand.postingCadence || 'sensible for the market'}

Build the calendar. Vary format and persona so the feed does not read as ${(i.days || 30)} versions
of the same advert. Include at least: product, proof/social proof, education,
behind-the-scenes, offer, and engagement/question posts.

Return JSON:
{
  "calendar": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "channel": "instagram|facebook|tiktok|linkedin|whatsapp",
      "time": "HH:MM",
      "format": "single image|carousel|reel|story|text|video",
      "pillar": "",
      "persona": "",
      "title": "short internal name for this slot",
      "hook": "",
      "caption": "full ready-to-post caption",
      "hashtags": ["#..."],
      "cta": "",
      "visualBrief": "",
      "status": "draft"
    }
  ],
  "weeklyFocus": [{"week":1,"focus":"","note":""}]
}`.trim()
  },

  /* 5 -------------------------------------------------------------------- */
  ads: {
    name: 'Ad Agent',
    blurb: 'Meta / TikTok / Google ad concepts, headlines, targeting and CTAs.',
    icon: 'megaphone',
    inputs: [
      { key: 'offer', label: 'What is the offer?', type: 'textarea', required: true },
      { key: 'platform', label: 'Platform', type: 'select', options: ['Meta (Facebook + Instagram)', 'TikTok', 'Google', 'LinkedIn', 'All'], default: 'Meta (Facebook + Instagram)' },
      { key: 'budget', label: 'Daily budget', type: 'text', placeholder: 'e.g. TZS 50,000/day' },
      { key: 'count', label: 'How many ad sets', type: 'number', default: 4 }
    ],
    build: (brand, i) => `
OFFER: ${i.offer}
PLATFORM: ${i.platform || 'Meta'}
DAILY BUDGET: ${i.budget || 'not stated - assume small, test-first'}
HOW MANY ADS: ${i.count || 4} distinct concepts, each with variants.

Targeting must be realistic for the brand's market - real interests, real
locations, real job titles. Do not suggest targeting options the platform
does not offer in that country.

Return JSON:
{
  "ads": [
    {
      "concept": "name of the angle",
      "platform": "",
      "objective": "traffic|messages|leads|sales|reach|video views",
      "audience": {"locations":[""], "ageRange":"", "interests":[""], "jobTitles":[""], "exclusions":[""], "notes":""},
      "placement": "feed|reels|stories|in-feed|search",
      "primaryTexts": ["3 variants"],
      "headlines": ["5 variants, each under 40 characters"],
      "descriptions": ["2 variants"],
      "cta": "Send Message|Learn More|Shop Now|Contact Us",
      "creativeBrief": "what the creative shows",
      "landingOrDestination": "WhatsApp|website|Messenger|form",
      "whatWeAreTesting": "the single variable this ad set isolates",
      "suggestedDailyBudget": "",
      "successSignal": "what a good result looks like in week 1"
    }
  ],
  "testingPlan": "how to run these against each other and what to kill first",
  "budgetSplit": [{"concept":"","share":"%"}]
}`.trim()
  },

  /* 6 -------------------------------------------------------------------- */
  competitor: {
    name: 'Competitor Monitor',
    blurb: 'Analyses rivals and surfaces the gaps you can own.',
    icon: 'search',
    inputs: [
      { key: 'competitors', label: 'Competitors (one per line)', type: 'textarea',
        placeholder: 'Leave blank to use the brands on file' },
      { key: 'notes', label: 'What have you observed?', type: 'textarea',
        placeholder: 'Paste anything you have seen them post, their prices, their claims' }
    ],
    build: (brand, i) => `
COMPETITORS: ${i.competitors || (brand.competitors || []).map(c => c.name).join('\n') || 'none supplied - reason about the typical competitor set in this market'}
OBSERVATIONS FROM THE OPERATOR:
${i.notes || '(none supplied)'}

IMPORTANT: you cannot browse. Do not state facts about a named competitor as if
you had checked them. Work from the observations supplied plus the structural
logic of this market, and mark every inference as an inference.

Return JSON:
{
  "marketPicture": "how this category is currently sold in this market",
  "competitors": [
    {"name":"", "likelyPositioning":"", "apparentStrengths":[""], "apparentWeaknesses":[""],
     "contentPattern":"what they seem to post", "confidence":"observed|inferred"}
  ],
  "gaps": [{"gap":"", "whyItIsOpen":"", "howWeTakeIt":""}],
  "trends": [{"trend":"", "relevance":"", "howToUseIt":""}],
  "thingsToStopDoing": [""],
  "whatToCheckManually": ["specific things the operator should go look at this week"]
}`.trim()
  },

  /* 7 -------------------------------------------------------------------- */
  campaign: {
    name: 'Campaign Manager',
    blurb: 'One brief in, a whole campaign out.',
    icon: 'rocket',
    inputs: [
      { key: 'brief', label: 'Campaign brief', type: 'textarea', required: true,
        placeholder: 'e.g. 400 embossed door panels arriving. 30-day campaign targeting hardware shops, contractors and homeowners in Tanzania.' },
      { key: 'days', label: 'Campaign length (days)', type: 'number', default: 30 },
      { key: 'startDate', label: 'Start date', type: 'date' }
    ],
    build: (brand, i) => `
CAMPAIGN BRIEF: ${i.brief}
LENGTH: ${i.days || 30} days from ${i.startDate || 'next Monday'}

This is the campaign backbone. Keep it tight - the detailed posts are generated
separately. Return JSON:
{
  "campaignName": "",
  "positioning": "",
  "bigIdea": "",
  "audiences": [{"persona":"","message":"","channel":"","share":"% of effort"}],
  "phases": [{"phase":"Tease|Launch|Proof|Offer|Last call","days":"1-7","goal":"","contentTypes":[""],"keyMessage":""}],
  "assetsNeeded": [{"asset":"","quantity":0,"owner":"design|video|copy|operator"}],
  "whatsappSequence": [{"day":0,"segment":"","message":"full message text, ready to send"}],
  "salesScripts": [{"scenario":"walk-in|phone|WhatsApp reply|price objection","script":""}],
  "faqs": [{"q":"","a":""}],
  "successMetrics": [{"metric":"","target":""}],
  "weeklyReviewQuestions": [""]
}`.trim()
  },

  /* 8 -------------------------------------------------------------------- */
  analytics: {
    name: 'Analytics Agent',
    blurb: 'Reads your numbers and says what to make next.',
    icon: 'chart',
    inputs: [
      { key: 'data', label: 'Paste your numbers', type: 'textarea', required: true,
        placeholder: 'Paste post insights, ad results, sales figures - messy is fine. CSV, a screenshot transcription, or just notes.' },
      { key: 'period', label: 'Period covered', type: 'text', placeholder: 'e.g. last 30 days' },
      { key: 'question', label: 'Anything specific you want answered?', type: 'text' }
    ],
    build: (brand, i) => `
PERIOD: ${i.period || 'unstated'}
OPERATOR QUESTION: ${i.question || 'none - give the general read'}

RAW DATA:
${i.data}

Analyse honestly. If the data is too thin to support a conclusion, say so rather
than manufacturing insight. Never round a number up in the brand's favour.

Return JSON:
{
  "dataQuality": "what you were given and what is missing",
  "headline": "the one sentence that matters",
  "whatWorked": [{"item":"","evidence":"","whyLikely":""}],
  "whatDidNot": [{"item":"","evidence":"","whyLikely":""}],
  "patterns": [{"pattern":"","confidence":"strong|weak","implication":""}],
  "makeMoreOf": [{"contentType":"","reason":"","example":"a specific post to make next"}],
  "stopMaking": [{"contentType":"","reason":""}],
  "nextExperiments": [{"test":"","hypothesis":"","howToMeasure":""}],
  "nextSevenDays": [{"day":1,"action":""}]
}`.trim()
  },

  /* 9 -------------------------------------------------------------------- */
  persona: {
    name: 'Customer Persona Agent',
    blurb: 'Builds each buyer type and the message that moves them.',
    icon: 'users',
    inputs: [
      { key: 'segments', label: 'Which buyer types?', type: 'textarea',
        placeholder: 'e.g. contractors, hardware shops, homeowners, architects' },
      { key: 'depth', label: 'Detail level', type: 'select', options: ['standard', 'deep'], default: 'standard' }
    ],
    build: (brand, i) => `
BUYER TYPES: ${i.segments || (brand.personas || []).map(p => p.name).join(', ') || 'derive them from the brand brief'}
DEPTH: ${i.depth || 'standard'}

Build each persona as a buying machine, not a demographic sketch. What makes
them say yes today, and what makes them stall.

Return JSON:
{
  "personas": [
    {
      "name": "",
      "role": "",
      "context": "a day in their working life relevant to this purchase",
      "buyingTrigger": "the moment they start looking",
      "decisionCriteria": ["in order of weight"],
      "painPoints": [""],
      "objections": [{"objection":"","response":"how to answer it in one line"}],
      "whereTheyAre": "channels and physical places",
      "language": "the words they actually use for this product",
      "coreMessage": "",
      "hookExamples": ["3 opening lines written for them"],
      "proofTheyNeed": "",
      "wrongMove": "what would put them off instantly"
    }
  ],
  "messagingMatrix": [{"persona":"","instagram":"","facebook":"","tiktok":"","linkedin":"","whatsapp":""}]
}`.trim()
  },

  /* 10 ------------------------------------------------------------------- */
  repurpose: {
    name: 'Repurposing Agent',
    blurb: 'One asset in, 10-20 pieces of content out.',
    icon: 'recycle',
    inputs: [
      { key: 'asset', label: 'Describe the asset you have', type: 'textarea', required: true,
        placeholder: 'e.g. One 30-second clip of a fundi installing a gold embossed panel on a house in Mbezi' },
      { key: 'count', label: 'How many pieces', type: 'number', default: 15 },
      { key: 'channels', label: 'Channels', type: 'channels' }
    ],
    build: (brand, i) => `
SOURCE ASSET: ${i.asset}
TARGET: ${i.count || 15} distinct pieces of content from this one asset.
CHANNELS: ${channelList(brand, i.channels).join(', ')}

Each piece must be genuinely different in angle, format or audience - not the
same caption reworded. Say exactly which part of the source asset each piece uses.

Return JSON:
{
  "pieces": [
    {
      "n": 1,
      "channel": "",
      "format": "reel|carousel|single image|story|text|short video|document",
      "angle": "the distinct idea",
      "persona": "",
      "usesFromSource": "which seconds / which frame / which crop",
      "hook": "",
      "caption": "ready to paste",
      "onScreenText": [""],
      "hashtags": ["#..."],
      "cta": "",
      "editNotes": "crop, speed, captions, music direction"
    }
  ],
  "productionOrder": ["which to make first and why"]
}`.trim()
  }
};

/* Order shown in the UI */
const AGENT_ORDER = [
  'strategist', 'campaign', 'content', 'creative', 'social',
  'ads', 'persona', 'repurpose', 'competitor', 'analytics'
];

function listAgents() {
  return AGENT_ORDER.map(id => ({
    id,
    name: AGENTS[id].name,
    blurb: AGENTS[id].blurb,
    icon: AGENTS[id].icon,
    inputs: AGENTS[id].inputs
  }));
}

function buildPrompt(agentId, brand, input) {
  const agent = AGENTS[agentId];
  if (!agent) throw new Error('Unknown agent: ' + agentId);
  return { system: systemFor(brand), prompt: agent.build(brand, input || {}) };
}

module.exports = { AGENTS, AGENT_ORDER, listAgents, buildPrompt, systemFor };
