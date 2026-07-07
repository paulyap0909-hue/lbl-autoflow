import {
  buildLeadFirstContactMessage,
  leadFirstContactTemplate
} from '../config/leadMessageTemplates';

export const CORPORATE_SALES_WHATSAPP_MESSAGE = leadFirstContactTemplate;

const normalizeCandidate = (value: string) => {
  const digits = value.replace(/\D/g, '');
  const normalized = digits.startsWith('60')
    ? digits
    : digits.startsWith('0')
      ? `60${digits.slice(1)}`
      : '';

  return /^601\d{7,9}$/.test(normalized) ? normalized : '';
};

export const normalizeMalaysiaMobile = (phone: string) => {
  const groups = String(phone || '').split(/[,/]+/);

  for (const group of groups) {
    for (const value of group.trim().split(/\s+/)) {
      const normalized = normalizeCandidate(value);
      if (normalized) return normalized;
    }

    const normalizedGroup = normalizeCandidate(group);
    if (normalizedGroup) return normalizedGroup;
  }

  return '';
};

export const buildCorporateWhatsAppUrl = (
  phone: string,
  message = buildLeadFirstContactMessage()
) => {
  const normalizedPhone = normalizeMalaysiaMobile(phone);
  if (!normalizedPhone) return '';

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
};
