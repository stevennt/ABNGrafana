import * as d3 from 'd3';
import { TimeRange, dateTime, dateTimeParse, DataFrame, DisplayProcessor } from '@grafana/data';

export interface Point {
  time: number;
  value: number;
}

interface PointSet {
  time: number;
  values: Point[];
}

export interface BucketPoint {
  // dayMillis corresponds to the start of the day.
  dayMillis: number;

  // bucketStartMillis corresponds to the start of a bucket, for example the start of every hour.
  bucketStartMillis: number;

  value: number;
}

export interface BucketData {
  numBuckets: number;
  min: number;
  max: number;
  points: BucketPoint[];
  valueDisplay: DisplayProcessor;
  timeDisplay: DisplayProcessor;
}

// reduce applies a calculation to an aggregated point set.
const reduce = (agg: PointSet[], calculation: (n: Array<number | undefined>) => number): Point[] => {
  return agg.map(({ time, values }) => ({
    time: time,
    value: calculation(values.map(({ value }) => value)),
  }));
};

// groupByMinutes groups a set of points
export const groupByMinutes = (points: Point[], minutes: number, timeZone: string): PointSet[] => {
  // Create keys for interval start.
  const rounded = points.map(point => {
    const intervalStart = dateTime(point.time);
    intervalStart.subtract(intervalStart.minute ? intervalStart.minute() % minutes : 0.0, 'minutes');

    return {
      [intervalStart.valueOf()]: point,
    };
  });

  // Group by interval start.
  return Object.entries(
    rounded.reduce((acc: any, val: any) => {
      const intervalStartMillis: number = parseFloat(Object.keys(val)[0]);
      (acc[intervalStartMillis] = acc[intervalStartMillis] || []).push(val[intervalStartMillis]);
      return acc;
    }, {})
  ).map(([key, values]) => ({
    time: parseFloat(key),
    values: values as Point[],
  }));
};

// groupByDay works like to groupByDays but is a bit simpler.
export const groupByDay = (points: Point[]): PointSet[] => {
  const rounded = points.map(point => ({
    [dateTime(point.time)
      .startOf('day')
      .valueOf()]: point,
  }));

  return Object.entries(
    rounded.reduce((acc: any, val: any) => {
      const dayMillis: number = parseFloat(Object.keys(val)[0]);
      (acc[dayMillis] = acc[dayMillis] || []).push(val[dayMillis]);
      return acc;
    }, {})
  ).map(([key, values]) => ({
    time: parseFloat(key),
    values: values as Point[],
  }));
};

const defaultDisplay: DisplayProcessor = (value: any) => ({ numeric: value, text: value.toString() });
const minutesPerDay = 24 * 60;

// bucketize returns the main data structure used by the visualizations.
export const bucketize = (
  frame: DataFrame,
  timeZone: string,
  timeRange: TimeRange,
  dailyInterval: [number, number]
): BucketData => {
  console.log('render');
  // Use the first temporal field.
  const timeField = frame.fields.find(f => f.type === 'time');

  // Use the first numeric field.
  const valueField = frame.fields.find(f => f.type === 'number');

  // Convert data frame fields to rows.
  const rows = Array.from({ length: frame.length }, (v: any, i: number) => ({
    time: timeField?.values.get(i),
    value: valueField?.values.get(i),
  }));

  // Convert time range to dashboard time zone.
  const tzFrom = dateTimeParse(timeRange.from.valueOf(), { timeZone }).startOf('day');
  const tzTo = dateTimeParse(timeRange.to.valueOf(), { timeZone }).endOf('day');

  const extents = [tzFrom.startOf('day'), tzTo.endOf('day')];

  const filteredRows = rows
    .filter(row => {
      // Filter points within time range.
      const curr = dateTimeParse(row.time, { timeZone });
      return extents[0].valueOf() <= curr.valueOf() && curr.valueOf() < extents[1].valueOf();
    })
    .filter(row => {
      // Filter rows within interval.
      const dt = dateTimeParse(row.time, { timeZone });
      const hour = dt.hour ? dt.hour() : 0.0;
      return dailyInterval[0] <= hour && hour < dailyInterval[1];
    });

  // Extract the field configuration..
  const customData = valueField?.config.custom;

  // Group and reduce values.
  const groupedByMinutes = groupByMinutes(filteredRows, customData.groupBy, timeZone);
  const reducedMinutes = reduce(groupedByMinutes, calculations[customData.calculation]);
  const points = groupByDay(reducedMinutes).flatMap(({ time, values }) =>
    values.map(({ time, value }) => ({
      dayMillis: time,
      bucketStartMillis: time,
      value,
    }))
  );

  return {
    numBuckets: Math.floor(minutesPerDay / customData.groupBy),
    points: points,
    min: valueField?.config.min ?? Number.NEGATIVE_INFINITY,
    max: valueField?.config.max ?? Number.POSITIVE_INFINITY,
    valueDisplay: valueField?.display ? valueField?.display : defaultDisplay,
    timeDisplay: timeField?.display ? timeField?.display : defaultDisplay,
  };
};

// Lookup table for calculations.
const calculations: any = {
  mean: (vals: number[]) => d3.mean(vals),
  sum: (vals: number[]) => d3.sum(vals),
  count: (vals: number[]) => vals.length,
  min: (vals: number[]) => d3.min(vals),
  max: (vals: number[]) => d3.max(vals),
  first: (vals: number[]) => vals[0],
  last: (vals: number[]) => vals[vals.length - 1],
};
