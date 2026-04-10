import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import { env } from "../config";

export const BUSINESS_TIMEZONE = env.businessTimezone;

export const combineBusinessDateTime = (dateString: string, timeString: string) =>
  fromZonedTime(`${dateString}T${timeString}:00`, BUSINESS_TIMEZONE);

export const getBusinessDateString = (date: Date) =>
  formatInTimeZone(date, BUSINESS_TIMEZONE, "yyyy-MM-dd");

export const getBusinessTimeString = (date: Date) =>
  formatInTimeZone(date, BUSINESS_TIMEZONE, "HH:mm");

export const getBusinessDateTimeString = (date: Date) =>
  formatInTimeZone(date, BUSINESS_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");

export const getBusinessWeekday = (dateString: string) =>
  Number(formatInTimeZone(combineBusinessDateTime(dateString, "00:00"), BUSINESS_TIMEZONE, "i"));

export const getBusinessDayRange = (dateString: string) => {
  const start = combineBusinessDateTime(dateString, "00:00");
  const end = addDays(start, 1);

  return { start, end };
};
