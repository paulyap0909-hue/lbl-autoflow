const MALAYSIA_TIME_ZONE = 'Asia/Kuala_Lumpur';

export const getMalaysiaDateTimeInputs = (value: Date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MALAYSIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);

  const partValue = (type: 'year' | 'month' | 'day' | 'hour' | 'minute') =>
    parts.find((part) => part.type === type)?.value ?? '';

  return {
    date: `${partValue('year')}-${partValue('month')}-${partValue('day')}`,
    time: `${partValue('hour')}:${partValue('minute')}`,
  };
};
