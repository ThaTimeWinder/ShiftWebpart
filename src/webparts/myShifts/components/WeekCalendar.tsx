// src/webparts/myShifts/components/WeekCalendar.tsx
import * as React from 'react';
import { useEffect, useState } from 'react';
import { DateTime, Interval } from 'luxon';
import { MSGraphClientV3 } from '@microsoft/sp-http';
import { Icon } from '@fluentui/react';
import { IShift, getShiftsForDay } from '../services/ShiftsService';
import styles from './WeekCalendar.module.scss';

export interface IWeekCalendarProps {
  graphClient: MSGraphClientV3;
  userId: string;
  tz: string;
}

interface IDayShifts {
  date: DateTime;
  shifts: IShift[];
}

const HOURS_PER_DAY = 24;
const MINUTES_PER_DAY = 60 * HOURS_PER_DAY;

const WeekCalendar: React.FC<IWeekCalendarProps> = (props) => {
  const { graphClient, userId, tz } = props;

  // 1️⃣ Find "onsdag" i den uge, brugeren befinder sig i nu:
  // Luxon regner som standard mandag=startOf('week'), så plus 2 => onsdag.
  const today = DateTime.now().setZone(tz);
  const weekStart = today.startOf('week').plus({ days: 2 });

  // 2️⃣ State: en liste af DateTime-objekter for onsdag→onsdag (7 dage)
  const [days] = useState<DateTime[]>(() =>
    Array.from({ length: 7 }).map((_, i) => weekStart.plus({ days: i }))
  );

  // 3️⃣ State: gem IDayShifts for hver dag
  const [daysShifts, setDaysShifts] = useState<IDayShifts[]>([]);

  // 4️⃣ Når komponenten mountes, eller når "days" ændres,
  //    hent vagter for hver dag parallelt:
  useEffect(() => {
    const loadAllDays = async () => {
      const all: IDayShifts[] = [];

      for (const day of days) {
        try {
          const shifts = await getShiftsForDay(graphClient, day, userId);
          all.push({ date: day, shifts });
        } catch (e) {
          console.error(`Fejl ved hentning af shifts for ${day.toISODate()}`, e);
        }
      }

      setDaysShifts(all);
    };

    loadAllDays();
  }, [graphClient, userId, days]);

  // 5️⃣ Hjælpefunktion: Konverter ISO→"HH:mm"
  const formatHour = (isoString: string): string =>
    DateTime.fromISO(isoString).setZone(tz).toFormat('HH:mm');

  // 6️⃣ Hjælp til at beregne top/højde i % for en vagt (0–100% af dag)
  const minutesOfDay = (dt: DateTime) => dt.hour * 60 + dt.minute;
  const topPercent = (dt: DateTime) => (minutesOfDay(dt) / MINUTES_PER_DAY) * 100;
  const heightPercent = (start: DateTime, end: DateTime) =>
    ((minutesOfDay(end) - minutesOfDay(start)) / MINUTES_PER_DAY) * 100;

  // 7️⃣ Overlap‐beregning: find kolonneindex pr. vagt (N²‐algoritme, simpel)
  function computeOverlapCols(shiftsForDay: IShift[]): number[] {
    const n = shiftsForDay.length;
    const cols: number[] = new Array(n).fill(0);
    let maxCol = 0;

    for (let i = 0; i < n; i++) {
      const sI = shiftsForDay[i];
      const startI = DateTime.fromISO(sI.sharedShift.startDateTime).setZone(tz);
      const endI = DateTime.fromISO(sI.sharedShift.endDateTime).setZone(tz);
      let col = 0;

      for (let j = 0; j < i; j++) {
        const sJ = shiftsForDay[j];
        const startJ = DateTime.fromISO(sJ.sharedShift.startDateTime).setZone(tz);
        const endJ = DateTime.fromISO(sJ.sharedShift.endDateTime).setZone(tz);
        const intervalI = Interval.fromDateTimes(startI, endI);
        const intervalJ = Interval.fromDateTimes(startJ, endJ);

        if (intervalI.overlaps(intervalJ)) {
          // hvis overlappende, så gem en kolonne-værdi > j’s kolonne
          col = Math.max(col, cols[j] + 1);
        }
      }
      cols[i] = col;
      if (col > maxCol) {
        maxCol = col;
      }
    }

    return cols;
  }

  // 8️⃣ Render metrik, hvis der IKKE er nogen vagter for hele ugen
  if (daysShifts.length === 0) {
    return <div className={styles.status}>Indlæser vagter…</div>;
  }

  // 9️⃣ Hvis alle dage har tom array, vis "Ingen vagter"
  const allEmpty = daysShifts.every((ds) => ds.shifts.length === 0);
  if (allEmpty) {
    return <div className={styles.status}>Ingen vagter i hele ugen 🎉</div>;
  }

  return (
    <div className={styles.weekContainer}>
      {/* 10️⃣ GridContainer: 1 kolonne til timeLabels + 7 kolonner til hver dag */}
      <div className={styles.gridContainer}>
        {/* 11️⃣ Venstre kolonne: timeLabels */}
        <div className={styles.hourGrid}>
          {Array.from({ length: HOURS_PER_DAY }).map((_, hour) => (
            <div key={hour} className={styles.hourRow}>
              <div className={styles.hourLabel}>
                {hour.toString().padStart(2, '0')}:00
              </div>
            </div>
          ))}
        </div>

        {/* 12️⃣ Hver enkelt kolonne (én pr. dag) */}
        {daysShifts.map((dayShift, dayIdx) => {
          const day = dayShift.date;
          const shifts = dayShift.shifts;
          const overlapCols = computeOverlapCols(shifts);

          return (
            <div key={day.toISODate()} className={styles.column}>
              {/* Dags-header (f.eks. "onsdag 04 juni") */}
              <div className={styles.dayHeader}>
                {day.toFormat('ccc dd LLL yyyy')}
              </div>

              {/* Eventuelle vagter for netop denne dag: */}
              {shifts.map((s, i) => {
                const startDT = DateTime.fromISO(s.sharedShift.startDateTime).setZone(tz);
                const endDT = DateTime.fromISO(s.sharedShift.endDateTime).setZone(tz);
                const top = topPercent(startDT);
                const height = heightPercent(startDT, endDT);
                const colIndex = overlapCols[i];
                const totalCols = Math.max(...overlapCols) + 1;

                // Bredden = 100% / totalCols; Venstre forskydning = colIndex * (100/totalCols)%
                const widthPercent = 100 / totalCols;
                const leftPercent = colIndex * widthPercent;

                return (
                  <div
                    key={s.id}
                    className={styles.shiftBlock}
                    style={{
                      top: `${top}%`,
                      height: `${height}%`,
                      left: `${leftPercent}%`,
                      width: `${widthPercent}%`
                    }}
                  >
                    <div className={styles.shiftInfo}>
                      <div className={styles.shiftTime}>
                        {formatHour(s.sharedShift.startDateTime)} –{' '}
                        {formatHour(s.sharedShift.endDateTime)}
                      </div>
                      <div className={styles.shiftTeam}>
                        {s.teamInfo?.displayName ?? s.teamId}
                      </div>
                      {overlapCols.filter((c) => c === colIndex).length > 1 && (
                        <Icon iconName="WarningSolid" className={styles.overlapIcon} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WeekCalendar;
