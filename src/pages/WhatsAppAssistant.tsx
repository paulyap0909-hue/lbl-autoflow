import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clipboard,
  FlaskConical,
  Languages,
  MessageCircle,
  RefreshCw,
  Scissors,
  ShieldAlert,
  Sparkles,
  UserRoundCheck
} from 'lucide-react';

type Scenario =
  | 'Personal Sharing'
  | 'Birthday Party'
  | 'Office Tea Break'
  | 'Event / Dessert Table'
  | 'Corporate Order'
  | 'Partnership'
  | 'Urgent Order'
  | 'Complaint';

type ReplyLanguage = 'English' | 'Chinese';
type ReplyTone = 'Friendly' | 'Premium' | 'Short';

type OrderField = {
  label: string;
  value: string | null;
  required: boolean;
};

type QuantityInfo = {
  pieceQuantity: number | null;
  guestCount: number | null;
  guestRange: [number, number] | null;
  guestLabel: string | null;
};

type AssistantResult = {
  reply: string;
  intent: string;
  quantity: number | null;
  guestCountLabel: string | null;
  scenario: Scenario;
  missingFields: string[];
  nextQuestion: string;
  humanTakeover: boolean;
  takeoverReasons: string[];
  orderFields: OrderField[];
};

const testScenarios = [
  { label: 'Price Enquiry', message: 'Hi, may I know how much your mini tarts are per piece?' },
  { label: 'Flavour Enquiry', message: 'Hi, what mini tart flavours do you have? Which flavours are most popular?' },
  { label: 'Personal Sharing', message: 'Hi, I would like some mini tarts for sharing at home with my family. What quantity would you recommend?' },
  { label: 'Birthday Party', message: 'Hi, I am planning a birthday party for 30 guests next Saturday at 3pm. How many mini tarts should I order?' },
  { label: '60-70 Pax Party', message: 'Hi, I have a party for around 60-70 pax with other desserts available. How many mini tarts do you recommend?' },
  { label: 'Bulk Discount', message: 'Hi, I am considering 120 pcs of mini tarts for a company event. Is there a bulk discount?' },
  { label: 'Delivery Enquiry', message: 'Hi, can you deliver mini tarts to Petaling Jaya next Friday at 2pm? What is the delivery fee?' },
  { label: 'Urgent Tomorrow Morning', message: 'Urgent, I need 48 pcs tomorrow morning at 9am. Can you confirm this order for me?' },
  { label: 'Cafe Partnership', message: 'Hi, I manage a cafe in Damansara and would like to discuss a partnership to sell your mini tarts.' },
  { label: 'Complaint / Refund', message: 'Hi, I have a complaint about my order and would like to request a refund. The tarts arrived damaged.' }
] as const;

const flavours = [
  'Matcha Red Bean',
  'Chocolate Noir',
  'Honey Br\u00fbl\u00e9e',
  'Lime Cheese',
  'Biscoff',
  'Black Sesame'
];

const quickTemplates = [
  {
    label: 'Price Reply',
    content: 'Hi, our Mini Tarts are RM2.50 per piece. Orders of 100 pieces and above receive 10% off, while 200 pieces and above receive 20% off. Please share your required quantity and date so our team can check availability before confirming.'
  },
  {
    label: 'Flavour Reply',
    content: `Hi, our six Mini Tart flavours are ${flavours.join(', ')}. Please share your preferred quantity and we can help with the flavour allocation. Final availability will be confirmed by our team.`
  },
  {
    label: 'Delivery Reply',
    content: 'Hi, delivery availability and charges depend on the location, date and time. Please share the full delivery address or postcode so our team can check before confirming.'
  },
  {
    label: 'Storage Reply',
    content: 'Hi, our Mini Tarts are freshly prepared and best consumed on the same day. Please share your collection or delivery time so our staff can advise the most suitable handling arrangement.'
  },
  {
    label: 'Halal / Muslim-friendly Reply',
    content: 'Hi, let me check the latest ingredient and Muslim-friendly information with our staff before advising. We do not want to make an incorrect certification claim, and our team will confirm this for you.'
  },
  {
    label: 'Follow-up Reply',
    content: 'Hi, just following up on your Mini Tart enquiry. Please let us know your preferred date, quantity and delivery or self-collection arrangement when ready. Our team will check availability before confirming the order.'
  }
] as const;

const scenarios: Scenario[] = [
  'Personal Sharing',
  'Birthday Party',
  'Office Tea Break',
  'Event / Dessert Table',
  'Corporate Order',
  'Partnership',
  'Urgent Order',
  'Complaint'
];

const scenarioKeywords: Array<{ scenario: Scenario; keywords: string[] }> = [
  { scenario: 'Complaint', keywords: ['complaint', 'refund', 'wrong order', 'damaged', 'bad', 'not fresh', 'cancel', 'cancellation'] },
  { scenario: 'Partnership', keywords: ['partnership', 'collaboration', 'collab', 'reseller', 'supplier'] },
  { scenario: 'Urgent Order', keywords: ['urgent', 'asap', 'today', 'tomorrow morning', 'last minute'] },
  { scenario: 'Corporate Order', keywords: ['corporate', 'company', 'staff event', 'client', 'training', 'meeting'] },
  { scenario: 'Office Tea Break', keywords: ['office', 'tea break', 'staff gathering'] },
  { scenario: 'Event / Dessert Table', keywords: ['event', 'dessert table', 'wedding', 'hotel', 'catering'] },
  { scenario: 'Birthday Party', keywords: ['birthday', 'party', 'celebration'] }
];

const humanKeywords = [
  'urgent',
  'tomorrow morning',
  'complaint',
  'refund',
  'cancel',
  'cancellation',
  'partnership',
  'special discount',
  'hotel',
  'cafe',
  'restaurant',
  'catering',
  'event company'
];

const writeClipboardText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const copyArea = document.createElement('textarea');
    copyArea.value = text;
    copyArea.setAttribute('readonly', 'true');
    copyArea.style.position = 'fixed';
    copyArea.style.opacity = '0';
    document.body.appendChild(copyArea);
    copyArea.select();
    document.execCommand('copy');
    document.body.removeChild(copyArea);
  }
};

const detectQuantity = (message: string): QuantityInfo => {
  const rangeMatch = message.match(/\b(?:about\s+|around\s+)?(\d{1,4})\s*(?:-|\u2013|to)\s*(\d{1,4})\s*(pax|people|guests?)\b/i);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    const guestRange: [number, number] = start <= end ? [start, end] : [end, start];
    return {
      pieceQuantity: null,
      guestCount: null,
      guestRange,
      guestLabel: `${guestRange[0]}\u2013${guestRange[1]} pax`
    };
  }

  const matches = [...message.matchAll(/\b(\d{1,4})\s*(pcs?|pieces?|pax|people|guests?)\b/gi)];
  const pieceQuantities = matches
    .filter((match) => /pcs?|pieces?/i.test(match[2]))
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  const guestCounts = matches
    .filter((match) => /pax|people|guests?/i.test(match[2]))
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  const pieceQuantity = pieceQuantities.length ? Math.max(...pieceQuantities) : null;
  const guestCount = guestCounts.length ? Math.max(...guestCounts) : null;

  return {
    pieceQuantity,
    guestCount,
    guestRange: null,
    guestLabel: guestCount ? `${guestCount} pax` : null
  };
};

const detectScenario = (message: string, selectedScenario: Scenario | null): Scenario => {
  if (selectedScenario) return selectedScenario;
  const normalized = message.toLowerCase();
  return scenarioKeywords.find(({ keywords }) => keywords.some((keyword) => normalized.includes(keyword)))?.scenario
    ?? 'Personal Sharing';
};

const detectIntent = (message: string, scenario: Scenario) => {
  const normalized = message.toLowerCase();
  if (/complaint|refund|wrong|damaged|not fresh|cancel/.test(normalized)) return 'Complaint / service recovery';
  if (/partnership|collab|reseller/.test(normalized)) return 'Partnership enquiry';
  if (/urgent|asap|today|tomorrow morning|last minute/.test(normalized)) return 'Urgent availability enquiry';
  if (/deliver|delivery|location|area|postcode/.test(normalized)) return 'Delivery enquiry';
  if (/discount|bulk|100\s*(?:pcs?|pieces?)|200\s*(?:pcs?|pieces?)/.test(normalized)) return 'Bulk discount enquiry';
  if (/price|pricing|how much|cost|rm\s*\d/.test(normalized)) return 'Price enquiry';
  if (/birthday|party|guest|pax|event|dessert table|wedding/.test(normalized)) return 'Party / event enquiry';
  if (/corporate|office|company|tea break|staff/.test(normalized)) return 'Corporate / office enquiry';
  return `${scenario} enquiry`;
};

const extractOrderFields = (message: string, quantityInfo: QuantityInfo): OrderField[] => {
  const normalized = message.toLowerCase();
  const customerName = message.match(/\b(?:my name is|this is)\s+([a-z][a-z'-]{1,24})\b/i)?.[1] ?? null;
  const date = message.match(/\b(today|tomorrow|tonight|next\s+\w+|\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*)\b/i)?.[0] ?? null;
  const time = message.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b/i)?.[0] ?? null;
  const flavourAliases: Array<{ name: string; patterns: RegExp[] }> = [
    { name: 'Matcha Red Bean', patterns: [/\bmatcha\b/i, /\bred bean\b/i] },
    { name: 'Chocolate Noir', patterns: [/\bchocolate noir\b/i, /\bchocolate\b/i] },
    { name: 'Honey Br\u00fbl\u00e9e', patterns: [/\bhoney br(?:\u00fb|u)l(?:\u00e9|e)e\b/i, /\bbrulee\b/i] },
    { name: 'Lime Cheese', patterns: [/\blime cheese\b/i, /\blime\b/i] },
    { name: 'Biscoff', patterns: [/\bbiscoff\b/i] },
    { name: 'Black Sesame', patterns: [/\bblack sesame\b/i] }
  ];
  const selectedFlavours = flavourAliases
    .filter((flavour) => flavour.patterns.some((pattern) => pattern.test(message)))
    .map((flavour) => flavour.name);
  const fulfilment = /self\s*collect|pickup|pick\s*up|collection/.test(normalized)
    ? 'Self Collect'
    : /deliver|delivery/.test(normalized)
      ? 'Delivery'
      : null;
  const location = message.match(/\b(pj|kl|selangor|kuala lumpur|petaling jaya|damansara|shah alam|subang|\d{5})\b/i)?.[0] ?? null;
  const payment = message.match(/\b(paid|pending payment|bank transfer|cash|qr|debit card|credit card|card)\b/i)?.[0] ?? null;

  const isSixtyToSeventyGuests = quantityInfo.guestRange
    ? quantityInfo.guestRange[0] >= 60 && quantityInfo.guestRange[1] <= 70
    : Boolean(quantityInfo.guestCount && quantityInfo.guestCount >= 60 && quantityInfo.guestCount <= 70);
  const tartQuantity = quantityInfo.pieceQuantity
    ? `${quantityInfo.pieceQuantity} pcs`
    : isSixtyToSeventyGuests
      ? 'Recommended around 100 pcs'
      : null;

  return [
    { label: 'Customer Name', value: customerName, required: true },
    { label: 'Date', value: date, required: true },
    { label: 'Time', value: time, required: true },
    ...(quantityInfo.guestLabel ? [{ label: 'Guest Count', value: quantityInfo.guestLabel, required: false }] : []),
    { label: 'Tart Quantity', value: tartQuantity, required: true },
    { label: 'Flavour', value: selectedFlavours.length ? selectedFlavours.join(', ') : null, required: true },
    { label: 'Pickup / Delivery', value: fulfilment, required: true },
    { label: 'Address if delivery', value: fulfilment === 'Self Collect' ? 'Not required' : location, required: fulfilment === 'Delivery' },
    { label: 'Payment Status', value: payment, required: true }
  ];
};

const getRecommendation = (scenario: Scenario, quantityInfo: QuantityInfo, message: string, language: ReplyLanguage) => {
  const guestMinimum = quantityInfo.guestRange?.[0] ?? quantityInfo.guestCount;
  const guestMaximum = quantityInfo.guestRange?.[1] ?? quantityInfo.guestCount;
  const hasEventContext = /birthday|party|dessert table|other desserts?|other food|event|wedding/i.test(message);
  const isSixtyToSeventyEvent = Boolean(
    guestMinimum && guestMaximum
    && guestMinimum >= 60
    && guestMaximum <= 70
    && hasEventContext
  );

  if (language === 'Chinese') {
    if (isSixtyToSeventyEvent) return '\u5982\u679c 60\u201370 \u4f4d\u5bbe\u5ba2\u7684\u805a\u4f1a\u8fd8\u6709\u5176\u4ed6\u98df\u7269\u6216\u751c\u70b9\uff0c\u6211\u4eec\u901a\u5e38\u5efa\u8bae\u7ea6 100 \u7c92\u3002100 \u7c92\u4ee5\u4e0a\u4eab\u6709 10% \u6298\u6263\u3002';
    if (quantityInfo.pieceQuantity && quantityInfo.pieceQuantity >= 100) return `\u5df2\u8bb0\u5f55\u60a8\u9700\u8981 ${quantityInfo.pieceQuantity} \u7c92\uff0c\u6211\u4eec\u4f1a\u5728\u6536\u5230\u5b8c\u6574\u8d44\u6599\u540e\u4eba\u5de5\u786e\u8ba4\u4ea7\u91cf\u548c\u6298\u6263\u3002`;
    if (scenario === 'Personal Sharing') return '\u4e2a\u4eba\u5206\u4eab\u53ef\u4ee5\u8003\u8651 6\u30019 \u6216 12 \u7c92\u3002';
    if (scenario === 'Birthday Party') return '\u5c0f\u578b\u805a\u4f1a\u901a\u5e38\u5efa\u8bae 24\u201348 \u7c92\u3002';
    if (scenario === 'Corporate Order' || scenario === 'Office Tea Break' || scenario === 'Event / Dessert Table') {
      return '\u5efa\u8bae\u5148\u786e\u8ba4\u4eba\u6570\u548c\u73b0\u573a\u662f\u5426\u8fd8\u6709\u5176\u4ed6\u751c\u70b9\uff0c\u6211\u4eec\u518d\u5efa\u8bae\u5408\u9002\u6570\u91cf\u3002';
    }
    return '\u6211\u4eec\u53ef\u4ee5\u6839\u636e\u4eba\u6570\u548c\u573a\u5408\u5efa\u8bae\u6570\u91cf\u3002';
  }

  if (isSixtyToSeventyEvent) return 'For around 60\u201370 guests with other food or desserts, we usually recommend around 100 pcs. Orders of 100 pcs and above receive 10% discount.';
  if (quantityInfo.pieceQuantity && quantityInfo.pieceQuantity >= 100) return `Noted for ${quantityInfo.pieceQuantity} pieces. Our team will manually confirm production capacity and the applicable discount after receiving the full details.`;
  if (scenario === 'Personal Sharing') return 'For personal sharing, 6, 9 or 12 pieces are good starting options.';
  if (scenario === 'Birthday Party') return 'For a small party, we usually suggest around 24-48 pieces.';
  if (scenario === 'Corporate Order' || scenario === 'Office Tea Break' || scenario === 'Event / Dessert Table') {
    return 'Share the guest count and whether other desserts will be served, and we can recommend a suitable quantity.';
  }
  return 'We can recommend a quantity once we know the occasion and guest count.';
};

const buildAssistantResult = (
  message: string,
  selectedScenario: Scenario | null,
  language: ReplyLanguage,
  tone: ReplyTone = 'Friendly',
  variant = 0
): AssistantResult => {
  const normalized = message.toLowerCase();
  const scenario = detectScenario(message, selectedScenario);
  const quantityInfo = detectQuantity(message);
  const intent = detectIntent(message, scenario);
  const orderFields = extractOrderFields(message, quantityInfo);
  const missingFields = orderFields.filter((field) => field.required && !field.value).map((field) => field.label);

  const takeoverReasons = humanKeywords.filter((keyword) => normalized.includes(keyword));
  if (scenario === 'Urgent Order' && !takeoverReasons.includes('urgent order')) takeoverReasons.push('urgent order');
  if (scenario === 'Complaint' && !takeoverReasons.includes('complaint')) takeoverReasons.push('complaint');
  if (scenario === 'Partnership' && !takeoverReasons.includes('partnership')) takeoverReasons.push('partnership');
  if (quantityInfo.pieceQuantity && quantityInfo.pieceQuantity > 200) takeoverReasons.push('quantity above 200 pcs');
  const humanTakeover = takeoverReasons.length > 0;

  const recommendation = getRecommendation(scenario, quantityInfo, message, language);
  const flavourLine = language === 'Chinese'
    ? `\u6211\u4eec\u6709 6 \u79cd\u53e3\u5473\uff1a${flavours.join('\u3001')}\u3002`
    : `We have six flavours: ${flavours.join(', ')}.`;

  const opening = language === 'Chinese'
    ? tone === 'Premium'
      ? '\u60a8\u597d\uff0c\u611f\u8c22\u60a8\u8003\u8651 Layer By Layer Bakery\u3002'
      : variant % 2 === 0 ? '\u60a8\u597d\uff0c\u8c22\u8c22\u60a8\u8054\u7cfb\u6211\u4eec\u3002' : '\u60a8\u597d\uff0c\u8c22\u8c22\u60a8\u5bf9 LBL Mini Tart \u611f\u5174\u8da3\u3002'
    : tone === 'Premium'
      ? 'Hello, thank you for considering Layer By Layer Bakery.'
      : variant % 2 === 0 ? 'Hi, thank you for contacting Layer By Layer Bakery.' : 'Hi, thank you for your interest in LBL Mini Tarts.';
  const includeOpening = tone !== 'Short';
  let nextQuestion = '';
  let replyLines: string[] = [];

  if (scenario === 'Complaint') {
    nextQuestion = language === 'Chinese'
      ? '\u8bf7\u63d0\u4f9b\u8ba2\u5355\u7f16\u53f7\u548c\u76f8\u5173\u7167\u7247\uff0c\u53ef\u4ee5\u5417\uff1f'
      : 'Could you share the order number and relevant photos?';
    replyLines = language === 'Chinese'
      ? [
          tone === 'Premium' ? '\u5f88\u62b1\u6b49\u8fd9\u6b21\u7684\u4f53\u9a8c\u6ca1\u6709\u8fbe\u5230\u60a8\u7684\u671f\u671b\u3002' : '\u5f88\u62b1\u6b49\u7ed9\u60a8\u5e26\u6765\u4e0d\u597d\u7684\u4f53\u9a8c\u3002',
          '\u6295\u8bc9\u6216\u9000\u6b3e\u4e0d\u4f1a\u81ea\u52a8\u5904\u7406\uff0c\u6211\u4eec\u7684\u540c\u4e8b\u5fc5\u987b\u4eba\u5de5\u5ba1\u6838\u3002',
          nextQuestion
        ]
      : [
          tone === 'Premium' ? 'We sincerely apologise that this experience did not meet your expectations.' : 'We are sorry to hear about this experience.',
          'Complaints and refunds are not processed automatically; our staff must review this personally.',
          nextQuestion
        ];
  } else if (scenario === 'Partnership') {
    nextQuestion = language === 'Chinese'
      ? '\u8bf7\u95ee\u53ef\u4ee5\u5206\u4eab\u516c\u53f8\u540d\u79f0\u548c\u5408\u4f5c\u6784\u60f3\u5417\uff1f'
      : 'Could you share your company name and proposed collaboration?';
    replyLines = language === 'Chinese'
      ? [
          tone === 'Premium' ? '\u611f\u8c22\u60a8\u8003\u8651\u4e0e Layer By Layer Bakery \u5408\u4f5c\u3002' : '\u8c22\u8c22\u60a8\u7684\u5408\u4f5c\u9080\u8bf7\u3002',
          '\u6240\u6709\u5408\u4f5c\u6761\u4ef6\u90fd\u4f1a\u7531\u6211\u4eec\u7684\u540c\u4e8b\u4eba\u5de5\u5ba1\u6838\u3002',
          nextQuestion
        ]
      : [
          tone === 'Premium' ? 'Thank you for considering a partnership with Layer By Layer Bakery.' : 'Thank you for reaching out about a partnership.',
          'All partnership terms are reviewed personally by our staff.',
          nextQuestion
        ];
  } else {
    if (intent === 'Price enquiry') {
      nextQuestion = language === 'Chinese' ? '\u8bf7\u95ee\u662f\u4e2a\u4eba\u5206\u4eab\u3001\u805a\u4f1a\u8fd8\u662f\u529e\u516c\u5ba4\u8336\u70b9\u5462\uff1f' : 'May I know if this is for personal sharing, a party or an office tea break?';
      replyLines = language === 'Chinese'
        ? ['Mini Tart \u552e\u4ef7\u662f\u6bcf\u7c92 RM2.50\u3002', '\u53ef\u4ece 6 \u79cd\u53e3\u5473\u4e2d\u6df7\u642d\u3002', nextQuestion]
        : ['Our Mini Tarts are RM2.50 per piece.', 'You may mix from 6 flavours.', nextQuestion];
    } else if (/flavou?r/i.test(message)) {
      nextQuestion = language === 'Chinese' ? '\u8bf7\u95ee\u9700\u8981\u591a\u5c11\u7c92\u548c\u54ea\u4e00\u5929\u5462\uff1f' : 'May I know the quantity and date you need?';
      replyLines = [flavourLine, nextQuestion];
    } else if (intent === 'Delivery enquiry') {
      nextQuestion = language === 'Chinese' ? '\u8bf7\u63d0\u4f9b\u914d\u9001\u5730\u5740\u3001\u65e5\u671f\u548c\u65f6\u95f4\uff0c\u53ef\u4ee5\u5417\uff1f' : 'Could you share the delivery address, date and time?';
      replyLines = language === 'Chinese'
        ? ['\u914d\u9001\u8303\u56f4\u548c\u8d39\u7528\u9700\u6839\u636e\u5730\u70b9\u786e\u8ba4\u3002', nextQuestion]
        : ['Delivery availability and charges depend on the location.', nextQuestion];
    } else if (intent === 'Bulk discount enquiry') {
      nextQuestion = language === 'Chinese' ? '\u8bf7\u95ee\u9700\u8981\u7684\u6570\u91cf\u548c\u65e5\u671f\u662f\u4ec0\u4e48\u5462\uff1f' : 'What quantity and date do you need?';
      replyLines = language === 'Chinese'
        ? ['100 \u7c92\u4ee5\u4e0a\u4eab\u6709 10% \u6298\u6263\uff0c200 \u7c92\u4ee5\u4e0a\u4eab\u6709 20% \u6298\u6263\u3002', nextQuestion]
        : ['Orders of 100 pcs and above receive 10% discount; 200 pcs and above receive 20%.', nextQuestion];
    } else if (intent === 'Urgent availability enquiry') {
      nextQuestion = language === 'Chinese' ? '\u8bf7\u63d0\u4f9b\u6570\u91cf\u3001\u65f6\u95f4\u548c\u81ea\u53d6\u6216\u914d\u9001\u5730\u70b9\uff0c\u53ef\u4ee5\u5417\uff1f' : 'Could you share the quantity, required time and pickup or delivery location?';
      replyLines = language === 'Chinese'
        ? ['\u7d27\u6025\u8ba2\u5355\u65e0\u6cd5\u81ea\u52a8\u786e\u8ba4\uff0c\u9700\u7531\u540c\u4e8b\u4eba\u5de5\u68c0\u67e5\u4ea7\u91cf\u3002', nextQuestion]
        : ['Urgent orders cannot be confirmed automatically; our staff must check production availability.', nextQuestion];
    } else {
      nextQuestion = language === 'Chinese' ? '\u8bf7\u95ee\u9700\u8981\u7684\u65e5\u671f\u548c\u65f6\u95f4\u662f\u4ec0\u4e48\u5462\uff1f' : 'May I know the date and time you need them?';
      replyLines = [recommendation, nextQuestion];
    }

    if (humanTakeover && intent !== 'Urgent availability enquiry') {
      const safetyLine = language === 'Chinese'
        ? '\u8fd9\u9879\u67e5\u8be2\u9700\u7531\u540c\u4e8b\u4eba\u5de5\u5ba1\u6838\uff0c\u4e0d\u4f1a\u81ea\u52a8\u786e\u8ba4\u8ba2\u5355\u6216\u7279\u522b\u6298\u6263\u3002'
        : 'Our staff must review this enquiry; no order or special discount will be confirmed automatically.';
      replyLines.splice(Math.max(replyLines.length - 1, 0), 0, safetyLine);
    }
  }

  const reply = [...(includeOpening ? [opening] : []), ...replyLines].slice(0, 4).join('\n');

  return {
    reply,
    intent,
    quantity: quantityInfo.pieceQuantity,
    guestCountLabel: quantityInfo.guestLabel,
    scenario,
    missingFields,
    nextQuestion,
    humanTakeover,
    takeoverReasons: [...new Set(takeoverReasons)],
    orderFields
  };
};

export default function WhatsAppAssistant() {
  const [customerMessage, setCustomerMessage] = useState('');
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [language, setLanguage] = useState<ReplyLanguage>('English');
  const [tone, setTone] = useState<ReplyTone>('Friendly');
  const [variant, setVariant] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copiedTemplate, setCopiedTemplate] = useState('');

  const wordCount = useMemo(() => customerMessage.trim().split(/\s+/).filter(Boolean).length, [customerMessage]);

  const generateReply = (nextLanguage = language, nextTone = tone, nextVariant = variant) => {
    if (!customerMessage.trim()) return;
    const nextResult = buildAssistantResult(customerMessage, selectedScenario, nextLanguage, nextTone, nextVariant);
    setLanguage(nextLanguage);
    setTone(nextTone);
    setResult(nextResult);
    setCopied(false);
  };

  const copyReply = async () => {
    if (!result?.reply) return;
    await writeClipboardText(result.reply);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const regenerate = () => {
    const nextVariant = variant + 1;
    setVariant(nextVariant);
    generateReply(language, tone, nextVariant);
  };

  const loadTestScenario = (message: string) => {
    setCustomerMessage(message);
    setSelectedScenario(null);
    setResult(null);
    setCopied(false);
  };

  const changeTone = (nextTone: ReplyTone) => {
    setTone(nextTone);
    if (result) generateReply(language, nextTone);
  };

  const changeLanguage = (nextLanguage: ReplyLanguage) => {
    setLanguage(nextLanguage);
    if (result) generateReply(nextLanguage, tone);
  };

  const copyTemplate = async (label: string, content: string) => {
    await writeClipboardText(content);
    setCopiedTemplate(label);
    window.setTimeout(() => setCopiedTemplate(''), 1800);
  };

  return (
    <div className="space-y-4 bg-[#010102] text-[#f7f8f8]">
      <section className="overflow-hidden rounded-[18px] border border-[#23252a] bg-[#0f1011] p-4 shadow-panel md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#C8A96B]/30 bg-[#C8A96B]/10 text-[#E4C98E]">
                <MessageCircle size={16} />
              </span>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C8A96B]">Customer Service Workspace</p>
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-white md:text-[28px]">WhatsApp Assistant V1.1.1</h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#8a8f98]">Paste a customer message, prepare a safe reply, then copy and send it manually.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200">Manual Send</span>
            <span className="rounded-lg border border-[#23252a] bg-[#111214] px-3 py-2 text-xs text-[#8a8f98]">Rule-based / No API</span>
          </div>
        </div>
      </section>

      <section className="rounded-[18px] border border-[#23252a] bg-[#0f1011] p-3.5">
        <div className="flex items-center gap-2">
          <FlaskConical size={15} className="text-[#C8A96B]" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C8A96B]">Load Test Scenario</p>
            <p className="mt-0.5 text-xs text-[#62666d]">Populate the customer message with a realistic enquiry.</p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {testScenarios.map((test) => (
            <button
              key={test.label}
              type="button"
              onClick={() => loadTestScenario(test.message)}
              className="min-h-10 rounded-lg border border-[#2d3036] bg-[#111214] px-3 py-2 text-left text-xs font-semibold text-[#d0d6e0] transition hover:border-[#C8A96B]/50 hover:bg-[#17191c] hover:text-white"
            >
              {test.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[18px] border border-[#23252a] bg-[#0f1011] p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#62666d]">Scenario</span>
          {scenarios.map((scenario) => (
            <button
              key={scenario}
              type="button"
              onClick={() => setSelectedScenario((current) => current === scenario ? null : scenario)}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${selectedScenario === scenario
                ? 'border-[#C8A96B] bg-[#C8A96B] text-[#111111]'
                : 'border-[#2d3036] bg-[#111214] text-[#d0d6e0] hover:border-[#C8A96B]/40 hover:text-white'
              }`}
            >
              {scenario}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.12fr)_minmax(280px,0.72fr)]">
        <article className="flex min-h-[520px] flex-col rounded-[18px] border border-[#23252a] bg-[#0f1011] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C8A96B]">01 / Customer Message</p>
              <h3 className="mt-1.5 text-base font-semibold text-white">Paste WhatsApp message</h3>
            </div>
            <span className="rounded-md bg-[#17191c] px-2 py-1 text-[10px] text-[#62666d]">{wordCount} words</span>
          </div>

          <textarea
            value={customerMessage}
            onChange={(event) => setCustomerMessage(event.target.value)}
            placeholder="Example: Hi, how much are your mini tarts? I need desserts for a birthday party with 30 guests next Saturday. Can you deliver to PJ?"
            className="mt-4 min-h-[300px] flex-1 resize-none rounded-xl border border-[#2d3036] bg-[#090a0b] p-4 text-sm leading-6 text-white outline-none transition placeholder:text-[#4f535a] focus:border-[#C8A96B]/60"
          />

          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#23252a] bg-[#111214] px-3 py-2.5">
            <p className="text-xs text-[#8a8f98]">Selected: <span className="font-semibold text-[#E4C98E]">{selectedScenario || 'Auto detect'}</span></p>
            <button
              type="button"
              onClick={() => generateReply()}
              disabled={!customerMessage.trim()}
              className="flex min-h-10 items-center gap-2 rounded-lg bg-[#C8A96B] px-4 py-2 text-xs font-semibold text-[#111111] transition hover:bg-[#D8BC7A] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sparkles size={15} />
              Generate Reply
            </button>
          </div>
        </article>

        <article className="flex min-h-[520px] flex-col rounded-[18px] border border-[#23252a] bg-[#0f1011] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C8A96B]">02 / Suggested Reply</p>
              <h3 className="mt-1.5 text-base font-semibold text-white">Staff-reviewed response</h3>
            </div>
            {result && <span className="rounded-md border border-[#2d3036] bg-[#111214] px-2 py-1 text-[10px] font-semibold text-[#8a8f98]">{tone} / {language}</span>}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-[#23252a] bg-[#111214] p-2">
            {(['Friendly', 'Premium', 'Short'] as ReplyTone[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => changeTone(option)}
                className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${tone === option ? 'bg-[#C8A96B] text-[#111111]' : 'text-[#d0d6e0] hover:bg-white/5'}`}
              >
                {option}
              </button>
            ))}
            <span className="hidden w-px bg-[#2d3036] sm:block" />
            {(['English', 'Chinese'] as ReplyLanguage[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => changeLanguage(option)}
                className={`flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${language === option ? 'bg-[#5e6ad2] text-white' : 'text-[#d0d6e0] hover:bg-white/5'}`}
              >
                <Languages size={13} /> {option}
              </button>
            ))}
          </div>

          <div className="mt-3 min-h-[280px] flex-1 rounded-xl border border-[#2d3036] bg-[#090a0b] p-4">
            {result ? (
              <p className="whitespace-pre-wrap text-sm leading-6 text-[#eef0f3]">{result.reply}</p>
            ) : (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#2d3036] bg-[#111214] text-[#62666d]">
                  <Sparkles size={19} />
                </span>
                <p className="mt-3 text-sm font-semibold text-[#d0d6e0]">No reply generated yet</p>
                <p className="mt-1 max-w-xs text-xs leading-5 text-[#62666d]">Paste the customer message and generate a draft. Nothing is sent automatically.</p>
              </div>
            )}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <button type="button" onClick={copyReply} disabled={!result} className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-35">
              {copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? 'Copied' : 'Copy Reply'}
            </button>
            <button type="button" onClick={regenerate} disabled={!result} className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#2d3036] bg-[#111214] px-3 py-2 text-xs font-semibold text-[#d0d6e0] hover:border-[#C8A96B]/40 disabled:opacity-35">
              <RefreshCw size={15} /> Regenerate
            </button>
            <button type="button" onClick={() => generateReply(language, 'Short')} disabled={!result} className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#2d3036] bg-[#111214] px-3 py-2 text-xs font-semibold text-[#d0d6e0] hover:border-[#C8A96B]/40 disabled:opacity-35">
              <Scissors size={15} /> Make Shorter
            </button>
          </div>
        </article>

        <aside className="space-y-4">
          <section className={`rounded-[18px] border p-4 ${result?.humanTakeover ? 'border-rose-500/30 bg-rose-500/[0.07]' : 'border-[#23252a] bg-[#0f1011]'}`}>
            <div className="flex items-start gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${result?.humanTakeover ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
                {result?.humanTakeover ? <ShieldAlert size={17} /> : <UserRoundCheck size={17} />}
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#62666d]">Human Takeover</p>
                <p className={`mt-1 text-sm font-semibold ${result?.humanTakeover ? 'text-rose-200' : 'text-white'}`}>
                  {result?.humanTakeover ? 'Human Takeover Required' : 'Standard reply flow'}
                </p>
              </div>
            </div>
            {result?.humanTakeover ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm font-semibold text-rose-200">Do not confirm this order automatically.</p>
                <p className="text-xs leading-5 text-rose-100/70">Detected: {result.takeoverReasons.join(', ')}. Staff must review availability, discounts, complaints or commercial terms before replying.</p>
              </div>
            ) : (
              <p className="mt-3 text-xs leading-5 text-[#8a8f98]">Review the draft before sending. The assistant never confirms an order or approves a discount automatically.</p>
            )}
          </section>

          <section className="rounded-[18px] border border-[#23252a] bg-[#0f1011] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C8A96B]">03 / Order Summary</p>
            {result ? (
              <div className="mt-3 space-y-3">
                {[
                  ['Detected intent', result.intent],
                  ['Scenario', result.scenario],
                  result.guestCountLabel
                    ? ['Guest Count', result.guestCountLabel]
                    : ['Tart Quantity', result.quantity ? `${result.quantity} pcs` : 'Not provided']
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-[#23252a] bg-[#111214] p-3">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-[#62666d]">{label}</p>
                    <p className="mt-1 text-sm font-semibold text-white">{value}</p>
                  </div>
                ))}

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#62666d]">Missing Information</p>
                    <span className="text-[10px] font-semibold text-amber-200">{result.missingFields.length} missing</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {result.orderFields.map((field) => {
                      const missing = field.required && !field.value;
                      return (
                        <div key={field.label} className={`min-w-0 rounded-lg border p-2.5 ${missing ? 'border-amber-500/25 bg-amber-500/[0.08]' : 'border-emerald-500/15 bg-emerald-500/[0.05]'}`}>
                          <div className="flex items-center gap-1.5">
                            {missing ? <AlertTriangle size={12} className="shrink-0 text-amber-300" /> : <CheckCircle2 size={12} className="shrink-0 text-emerald-300" />}
                            <p className={`truncate text-[10px] font-semibold ${missing ? 'text-amber-200' : 'text-emerald-200'}`}>{field.label}</p>
                          </div>
                          <p className="mt-1 truncate text-[10px] text-[#8a8f98]">{field.value || (field.required ? 'Missing' : 'Not required')}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-[#C8A96B]/20 bg-[#C8A96B]/[0.07] p-3">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-[#C8A96B]">Recommended next question</p>
                  <p className="mt-1.5 text-xs leading-5 text-[#E4C98E]">{result.nextQuestion}</p>
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-[#2d3036] px-4 py-8 text-center text-xs leading-5 text-[#62666d]">Order details will appear after a reply is generated.</div>
            )}
          </section>

          <section className="rounded-[18px] border border-[#23252a] bg-[#0f1011] p-4">
            <div className="flex items-center gap-2 text-[#E4C98E]"><AlertTriangle size={15} /><p className="text-xs font-semibold">LBL knowledge guardrail</p></div>
            <ul className="mt-3 space-y-1.5 text-xs leading-5 text-[#8a8f98]">
              <li>RM2.50 per Mini Tart</li>
              <li>100+ pcs: 10% discount</li>
              <li>200+ pcs: 20% discount</li>
              <li>Pre-order at least 1 day</li>
              <li>Delivery depends on location</li>
              <li>Best consumed on the same day</li>
            </ul>
          </section>
        </aside>
      </section>

      <section className="rounded-[18px] border border-[#23252a] bg-[#0f1011] p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C8A96B]">Quick Copy Templates</p>
            <h3 className="mt-1 text-base font-semibold text-white">Common customer service replies</h3>
          </div>
          <p className="text-xs text-[#62666d]">Copy, review and send manually.</p>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {quickTemplates.map((template) => (
            <article key={template.label} className="flex min-w-0 flex-col rounded-xl border border-[#2d3036] bg-[#111214] p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">{template.label}</p>
                <button
                  type="button"
                  aria-label={`Copy ${template.label}`}
                  onClick={() => copyTemplate(template.label, template.content)}
                  className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[#2d3036] bg-[#0b0c0d] px-2.5 py-1.5 text-[10px] font-semibold text-[#d0d6e0] transition hover:border-[#C8A96B]/50 hover:text-white"
                >
                  {copiedTemplate === template.label ? <Check size={13} /> : <Clipboard size={13} />}
                  {copiedTemplate === template.label ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#8a8f98]">{template.content}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
