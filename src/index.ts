import { has, optional, parse as parseWith, ParseGenerator, ParseYieldable } from 'yieldparser';

const whitespaceOptional = /^\s*/;

function* ParseInt() {
  const [stringValue]: [string] = yield /^\d+/;
  return parseInt(stringValue, 10);
}

const repeatsChoices = Object.freeze(['day', 'week', 'month', 'year'] as const);
type Repeat = (typeof repeatsChoices)[0 | 1 | 2 | 3 ];

const repeatingTypeChoices = Object.freeze(['daily', 'weekly', 'monthly', 'yearly'] as const);
type RepeatType = (typeof repeatingTypeChoices)[0 | 1 | 2 | 3 ];

function* EveryParser() {
  yield /^every\b/;
  yield whitespaceOptional;

  const interval = yield optional(ParseInt);

  yield whitespaceOptional

  const repeats: Repeat = yield repeatsChoices;
  
  if (interval)
    yield /^s/;

  return { interval, repeats };
}

const weekdayChoices = Object.freeze(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const);
type Weekday = (typeof weekdayChoices)[0 | 1 | 2 | 3 | 4 | 5 | 6];

function* WeekdayParser() {
  let repeats: boolean = yield has(/^every\b/);
  yield optional(/^next\b/);

  yield whitespaceOptional;
  yield optional(/^on\b/);
  yield whitespaceOptional;
  
  const weekday: Weekday = yield weekdayChoices;
  repeats = repeats || (yield has(/^[s]\b/));

  return { weekday, repeats };
}

function* AnotherWeekdayParser() {
  yield whitespaceOptional;
  yield optional('and', 'or');
  yield whitespaceOptional;
  return yield WeekdayParser;
}

function* WeekdaysParser() {
  let repeats = false;
  
  const weekdays = new Set<Weekday>();
  
  let result: { weekday: Weekday, repeats: boolean };
  result = yield WeekdayParser;
  
  if (result.weekday)
    weekdays.add(result.weekday);
  repeats = repeats || result.repeats;
  
  while (result = yield optional(AnotherWeekdayParser)) {
    weekdays.add(result.weekday);
    repeats = repeats || result.repeats;
  }
  
  return { weekdays, repeats };
}

function* MinutesSuffixParser() {
  yield ':';
  const minutes = yield ParseInt;
  return minutes;
}

function* TimeOfDayParser() {
  let hours = yield ParseInt;
  const minutes = yield optional(MinutesSuffixParser);
  const amOrPm = yield optional('am', 'pm');
  if (amOrPm === 'pm' && hours <= 11) {
    hours += 12;
  } else if (amOrPm === 'am' && hours === 12) {
    hours = 24;
  }
  return { hours, minutes };
}

function* TimespanSuffixParser() {
  const started = yield optional('to', '-', '–', '—', 'until');
  if (started === undefined) return undefined;
  yield whitespaceOptional;
  return yield TimeOfDayParser;
}

function* TimespanParser() {
  yield ['from', 'at', ''];
  yield whitespaceOptional;
  const startTime = yield TimeOfDayParser;
  yield whitespaceOptional;
  const endTime = yield optional(TimespanSuffixParser);
  return { startTime, endTime };
}

export interface Result {
  weekdays: Set<Weekday>;
  repeats: undefined | 'weekly';
  startTime: { hours: number, minutes?: number };
  endTime: { hours: number, minutes?: number };
}

function mapRepeat(repeat: Repeat): RepeatType | undefined {
  switch (repeat){
    case "day":
      return "daily";
    case "week":
      return "weekly";
    case "month":
      return "monthly";
    case "year":
      return "yearly"
    default:
      return undefined;
  }
}

function* RepeatDateParser() {
  let repeats: RepeatType | undefined  = yield optional(...repeatingTypeChoices);
  let interval: number | undefined = undefined;

  if (!repeats) {
    const every: any = yield optional(EveryParser);
    repeats = mapRepeat(every?.repeats);
    interval = every?.interval;
  }
  
  let weekSpan: any;
  
  if (!repeats || repeats === "weekly") {
    yield whitespaceOptional;
    weekSpan = yield optional(WeekdaysParser);
    yield whitespaceOptional;

    if (weekSpan)
      repeats = repeats || (weekSpan.repeats ? 'weekly' : undefined);
  }

  const weekdays = repeats === 'weekly' 
    ? weekSpan?.weekdays || new Set([])
    : weekSpan?.weekdays;

  return { repeats, interval, weekdays }; 
}

function* NaturalDateParser(): ParseGenerator<Result> {  
  const repeatData: any = yield RepeatDateParser;
  
  yield whitespaceOptional;
  const timespan: any = yield optional(TimespanParser);    
  yield whitespaceOptional;

  return { 
    ...repeatData,
    ...timespan 
  };
}

export function parse(input: string): Result | null {
  input = input.toLowerCase();
  input = input.replace(/[,]/g, '');
  const parsedResult = parseWith(input, NaturalDateParser());
  return parsedResult.success ? parsedResult.result : null;
}
