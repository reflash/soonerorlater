import { has, optional, parse as parseWith, ParseGenerator, ParseYieldable } from 'yieldparser';

const whitespaceOptional = /^\s*/;

function* ParseInt() {
  const [stringValue]: [string] = yield /^\d+/;
  return parseInt(stringValue, 10);
}

const weekdayChoices = Object.freeze(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const);
type Weekday = (typeof weekdayChoices)[0 | 1 | 2 | 3 | 4 | 5 | 6];

function* WeekdayParser() {
  let repeats: boolean = yield has(/^every\b/);
  yield optional(/^next\b/);

  yield whitespaceOptional;

  let week = yield has(/^week\b/);
  
  if (!week){
    yield whitespaceOptional;
    
    const weekday: Weekday = yield weekdayChoices;
    repeats = repeats || (yield has(/^[s]\b/));

    return { weekday, repeats }
  }

  yield whitespaceOptional;
  yield optional(/^on\b/);
  yield whitespaceOptional;
  
  return { repeats };
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

function* NaturalDateParser(): ParseGenerator<Result> {
  let day = yield has(/^every day\b/);

  let weekSpan: any;
  if (!day) {
    yield whitespaceOptional;
    weekSpan = yield optional(WeekdaysParser);
    yield whitespaceOptional;
  }
  
  yield whitespaceOptional;
  const timespan: any = yield optional(TimespanParser);    
  yield whitespaceOptional;

  return { repeats: day ? 'daily' : weekSpan?.repeats ? 'weekly' : undefined, weekdays: weekSpan?.weekdays, ...timespan };
}

export function parse(input: string): Result | null {
  input = input.toLowerCase();
  input = input.replace(/[,]/g, '');
  const parsedResult = parseWith(input, NaturalDateParser());
  return parsedResult.success ? parsedResult.result : null;
}
