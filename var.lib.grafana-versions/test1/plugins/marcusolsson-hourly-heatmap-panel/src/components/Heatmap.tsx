import React from 'react';
import * as d3 from 'd3';
import { dateTimeParse } from '@grafana/data';
import { TimeRegion } from '../TimeRegionEditor';

import { BucketData } from '../bucket';

import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';

import { Tooltip } from './Tooltip';
const minutesPerDay = 24 * 60;
interface HeatmapProps {
  values: string[];
  data: BucketData;
  colorScale: any;
  width: number;
  height: number;
  numBuckets: number;
  timeZone: string;
  dailyIntervalMinutes: [number, number];
  regions: TimeRegion[];
}

/**
 * A two-dimensional grid of colored cells.
 */
export const Heatmap: React.FC<HeatmapProps> = ({
  values,
  data,
  colorScale,
  width,
  height,
  numBuckets,
  timeZone,
  dailyIntervalMinutes,
  regions,
}) => {
  const x = d3
    .scaleBand()
    .domain(values)
    .range([0, width]);

  const y = d3
    .scaleLinear()
    .domain(dailyIntervalMinutes)
    .range([0, height]);

  const cellWidth = Math.ceil(x.bandwidth());
  const cellHeight = bucketHeight(height, numBuckets, dailyIntervalMinutes);

  const intervalMinutes = dailyIntervalMinutes[1] - dailyIntervalMinutes[0];
  const pixelsPerMinute = height / intervalMinutes;

  return (
    <>
      <g>
        {data.points.map((d, i) => {
          const startOfDay = dateTimeParse(d.dayMillis, { timeZone }).startOf('day');
          const bucketStart = dateTimeParse(d.bucketStartMillis, { timeZone });
          const minutesSinceStartOfDay = bucketStart.hour!() * 60 + bucketStart.minute!();
          const displayValue = data.valueDisplay(d.value);

          return (
            <Tippy
              key={i}
              content={
                <div>
                  <Tooltip
                    bucketStartTime={bucketStart}
                    displayValue={displayValue}
                    numBuckets={numBuckets}
                    tz={timeZone}
                  />
                </div>
              }
              placement="bottom"
              animation={false}
            >
              <rect
                x={x(startOfDay.valueOf().toString())}
                y={Math.ceil(y(minutesSinceStartOfDay))}
                fill={colorScale(d.value)}
                width={cellWidth}
                height={cellHeight}
              />
            </Tippy>
          );
        })}
      </g>
      <g>
        {regions
          .filter(region => {
            const yPos = Math.ceil(y(region.start.hour * 60 + region.start.minute));
            return 0 <= yPos && yPos < height;
          })
          .map(region => {
            const regionDuration =
              region.end.hour * 60 + region.end.minute - (region.start.hour * 60 + region.start.minute);
            const yPos = Math.ceil(y(region.start.hour * 60 + region.start.minute));
            const regionHeight = Math.ceil(regionDuration * pixelsPerMinute);
            return (
              <rect
                x={0}
                y={yPos}
                width={width}
                height={yPos + regionHeight >= height ? height - yPos : regionHeight}
                stroke={region.color}
                fill={region.color}
                pointer-events="none"
                strokeWidth={2}
              />
            );
          })}
      </g>
    </>
  );
};

const bucketHeight = (height: number, numBuckets: number, dailyIntervalMinutes: [number, number]) => {
  const minutesPerBucket = minutesPerDay / numBuckets;
  const intervalMinutes = dailyIntervalMinutes[1] - dailyIntervalMinutes[0];
  const pixelsPerBucket = height / (intervalMinutes / minutesPerBucket);
  return Math.ceil(pixelsPerBucket);
};
