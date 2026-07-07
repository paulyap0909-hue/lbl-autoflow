const cleanName = (value?: string) => String(value || '').trim();

export const leadFirstContactTemplate = `Hi, this is Jessie from Layer By Layer Bakery.

May I know who would be the best person to speak with regarding office events, staff appreciation activities or corporate gifting?

We regularly support companies with dessert arrangements for meetings, team celebrations and client events, and I thought it might be worthwhile introducing our services to the appropriate contact.

Thank you.`;

export const leadFollowUpReplyTemplate = `Thank you for your reply.

We specialize in premium handcrafted mini tarts that are suitable for office tea breaks, staff appreciation events, corporate gifting and client functions.

I would be happy to share our menu and event options for your consideration.`;

export const buildLeadFirstContactMessage = (companyName?: string) => {
  const company = cleanName(companyName);
  if (!company) return leadFirstContactTemplate;

  return `Hi, this is Jessie from Layer By Layer Bakery.

May I know who would be the best person to speak with at ${company} regarding office events, staff appreciation activities or corporate gifting?

We regularly support companies with dessert arrangements for meetings, team celebrations and client events, and I thought it might be worthwhile introducing our services to the appropriate contact.

Thank you.`;
};

export const buildLeadFollowUpReplyMessage = (contactPerson?: string) => {
  const contact = cleanName(contactPerson);
  if (!contact) return leadFollowUpReplyTemplate;

  return `Hi ${contact}, thank you for your reply.

We specialize in premium handcrafted mini tarts that are suitable for office tea breaks, staff appreciation events, corporate gifting and client functions.

I would be happy to share our menu and event options for your consideration.`;
};
