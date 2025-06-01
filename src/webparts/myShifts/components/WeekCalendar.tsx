// src/webparts/myShifts/components/WeekCalendar.tsx
import * as React from 'react';
import { useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { MSGraphClientV3 } from '@microsoft/sp-http';
import { Icon } from '@fluentui/react';

import { getShiftsForDay, IShift } from '../services/ShiftsService';
import styles from './WeekCalendar.module.scss';

export interface IWeekCalendarProps {
  graphClient: MSGraphClientV3;
  userId: string;
  tz: string;
}

const HOURS_PER_DAY = 24;
const MINUTES_PER_DAY = 24 * 60;

/**
 * Returns an array of “column index” for each shift in shiftsForDay,
 * so that overlapping shifts occupy separate side-by-side columns.
 */
function computeOverlapCols(shiftsForDay: IShift[]): number[] {
  const len = shiftsForDay.length;
  const cols: number[] = new Array(len).fill(0);
  let maxCol = 0;

  for (let i = 0; i < len; i++) {
    const s1 = DateTime.fromISO(shiftsForDay[i].sharedShift.startDateTime);
    const e1 = DateTime.fromISO(shiftsForDay[i].sharedShift.endDateTime);
    let col = 0;

    // Compare shift i against all previous shifts to find a free column
    for (let j = 0; j < i; j++) {
      const s2 = DateTime.fromISO(shiftsForDay[j].sharedShift.startDateTime);
      const e2 = DateTime.fromISO(shiftsForDay[j].sharedShift.endDateTime);
      // Overlap if: start1 < end2 AND start2 < end1
      const overlaps = s1 < e2 && s2 < e1;
      if (overlaps && cols[j] === col) {
        col++;
        j = -1; // restart inner loop
      }
    }

    cols[i] = col;
    if (col > maxCol) {
      maxCol = col;
    }
  }

  return cols;
}

const WeekCalendar: React.FC<IWeekCalendarProps> = (props) => {
  const { graphClient, userId, tz } = props;

  // 1) Determine “start of week” as onsdag (Wednesday) for the current date in the user’s tz:
  //    Luxon’s startOf('week') returns Monday. Wednesday = Monday + 2 days.
  const today = DateTime.now().setZone(tz);
  const weekStart = today.startOf('week').plus({ days: 2 });

  // 2) Build an array of the 7 consecutive days (Wed → Wed):
  const [days] = useState<DateTime[]>(
    Array.from({ length: 7 }).map((_, idx) => weekStart.plus({ days: idx }))
  );

  // 3) daysShifts: for each day we’ll store { date: DateTime, shifts: IShift[] }:
  const [daysShifts, setDaysShifts] = useState<
    { date: DateTime; shifts: IShift[] }[]
  >([]);

  // 4) status flags:
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // 5) Whenever the component mounts, fetch shifts for each of the seven days:
  useEffect(() => {
    let isCancelled = false; // to avoid state updates if component unmounts

    async function loadAllWeek() {
      setLoading(true);
      setError(null);

      try {
        // Fire off parallel calls for each day:
        const allPromises = days.map(async (d) => {
          const result = await getShiftsForDay(graphClient, d, userId);
          return { date: d, shifts: result };
        });

        const results = await Promise.all(allPromises);

        if (!isCancelled) {
          setDaysShifts(results);
        }
      } catch (e) {
        if (!isCancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadAllWeek();

    return () => {
      isCancelled = true;
    };
  }, [days, graphClient, userId]);

 
  // 7) If still loading:
  if (loading) {
    return <div className={styles.status}>Indlæser vagter…</div>;
  }

  // 8) If error:
  if (error) {
    return <div className={styles.error}>Fejl under indlæsning: {error}</div>;
  }

  // 9) If all days have zero shifts, show a “no shifts this week” message:
  const allEmpty = daysShifts.every((ds) => ds.shifts.length === 0);
  if (allEmpty) {
    return (
      <div className={styles.status}>
        Ingen vagter i denne uge 🎉
      </div>
    );
  }

  // 10) Otherwise, render the full 7×24 grid plus the shift‐blocks:
  return (
    <div className={styles.weekContainer}>
      {/* --- Header Row: blank corner + each day’s name/date --- */}
      <div className={styles.headerRow}>
        <div className={styles.hourHeader} />
        {days.map((dayDt) => (
          <div key={dayDt.toISODate()} className={styles.dayHeader}>
            {dayDt.toFormat('ccc, dd LLL yyyy')}
          </div>
        ))}
      </div>

      {/* --- Hour‐Grid: 24 rows of 7 day‐columns --- */}
      <div className={styles.hourGrid}>
        {Array.from({ length: HOURS_PER_DAY }).map((_, hour) => (
          <div key={hour} className={styles.hourRow}>
            {/* Leftmost hour label */}
            <div className={styles.hourLabel}>
              {DateTime.fromObject({ hour }).toFormat('HH:mm')}
            </div>

            {/* 7 empty day‐cells (we’ll absolutely‐position shift‐blocks on top) */}
            {days.map((_, dayIndex) => (
              <div key={dayIndex} className={styles.dayColumn} />
            ))}
          </div>
        ))}

        {/* --- Now overlay all shift blocks for each day: --- */}
        {daysShifts.map((ds, dayIndex) => {
          // Compute overlap columns for that day:
          const cols = computeOverlapCols(ds.shifts);
          // The total number of overlapping columns on that day = max(cols)+1
          const maxCols =
            cols.length > 0 ? Math.max(...cols) + 1 : 1;

          return ds.shifts.map((shift, idx) => {
            // Convert start/end to user's TZ:
            const start = DateTime.fromISO(
              shift.sharedShift.startDateTime
            ).setZone(tz);
            const end = DateTime.fromISO(
              shift.sharedShift.endDateTime
            ).setZone(tz);

            // Calculate “top%” and “height%” relative to 24h grid:
            const minutesSinceMidnight = start.hour * 60 + start.minute;
            const topPercent =
              (minutesSinceMidnight / MINUTES_PER_DAY) * 100;

            const shiftMinutes =
              (end.hour * 60 + end.minute) -
              (start.hour * 60 + start.minute);
            const heightPercent = (shiftMinutes / MINUTES_PER_DAY) * 100;

            // Determine which “column index” this shift should occupy:
            const colIndex = cols[idx];
            // Width percent = 100 / # of overlapping columns:
            const widthPercent = 100 / maxCols;

            // Build inline styles for absolute positioning:
            const style: React.CSSProperties = {
              top: `${topPercent}%`,
              height: `${heightPercent}%`,
              left: `${(dayIndex * 100) / 7 +
                (colIndex * widthPercent) / 7}%`,
              // We divide by 7 (days) because left=0–100% for each dayColumn:
              // e.g. dayIndex=0 → left starts at 0%,
              //       dayIndex=1 → left starts at 100/7%, etc.
              width: `${widthPercent / 7 * 100}%`,
              // Background color (you can customize):
              backgroundColor: '#0078d4',
              color: '#ffffff',
            };

            return (
              <div
                key={shift.id}
                className={styles.shiftBlock}
                style={style}
              >
                <div className={styles.shiftInfo}>
                  <span className={styles.shiftTime}>
                    {`${start.toFormat('HH:mm')} – ${end.toFormat('HH:mm')}`}
                  </span>
                  <span className={styles.shiftTeam}>
                    {shift.teamInfo?.displayName ?? shift.teamId}
                  </span>
                </div>
                {/* If more than one shift uses this same colIndex, show warning icon */}
                {cols.filter((c) => c === colIndex).length > 1 && (
                  <Icon
                    iconName="WarningSolid"
                    className={styles.overlapIcon}
                  />
                )}
              </div>
            );
          });
        })}
      </div>
    </div>
  );
};

export default WeekCalendar;
