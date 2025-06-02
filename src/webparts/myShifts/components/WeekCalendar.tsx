// src/webparts/myShifts/components/WeekCalendar.tsx

import * as React from 'react';
import { DefaultButton, Text, Spinner, SpinnerSize } from '@fluentui/react';
import { DateTime, Interval } from 'luxon';
import styles from './WeekCalendar.module.scss';

export interface IShift {
  startTime:  DateTime;   // Luxon DateTime for vagt‐start (lokal tid)
  endTime:    DateTime;   // Luxon DateTime for vagt‐slut (lokal tid)
  teamName:   string;
  isOverlap?: boolean;
  theme:      string;     // Fx "white", "blue", "green", "darkPink", "yellow" osv.
}

export interface IWeekCalendarProps {
  weekStart:      DateTime;      // Mandag kl. 00:00 (lokal tid)
  shifts:         IShift[];      // Liste af vagter i denne uge
  allEmpty:       boolean;       // True hvis ingen vagter (og vi ikke loader)
  isLoading:      boolean;       // True hvis vi venter på data
  goPreviousWeek: () => void;    // Callback til “Forrige uge”
  goNextWeek:     () => void;    // Callback til “Næste uge”
  onRefresh:      () => void;    // Callback til “Opdater data”
}

const HOURS_IN_DAY = 24;
const WEEK_CONTAINER_HEIGHT_PX = 800;

const WeekCalendar: React.FC<IWeekCalendarProps> = ({
  weekStart,
  shifts,
  allEmpty,
  isLoading,
  goPreviousWeek,
  goNextWeek,
  onRefresh,
}) => {
  const pixelsPerHour = WEEK_CONTAINER_HEIGHT_PX / HOURS_IN_DAY;

  /**
   * Returnerer dag‐index [0..6], hvis dt ligger inden for [mandag..søndag].
   * Ellers −1 (< mandag) eller 7 (> søndag).
   */
  const getDayIndex = (dt: DateTime): number => {
    const diffDays = dt.startOf('day').diff(weekStart.startOf('day'), 'days').days;
    if (diffDays < 0) return -1;
    if (diffDays >= 7) return 7;
    return Math.floor(diffDays);
  };

  interface IInternalShift {
    dayIndex:     number;   // 0..6
    startHourDec: number;   // f.eks. 5.25 for 05:15
    endHourDec:   number;   // f.eks. 7.25 for 07:15 (eller 24 hvis split)
    teamName:     string;
    isOverlap:    boolean;
    theme:        string;   // f.eks. "white", "blue", "darkPink", "green"
    keyBase:      string;   // f.eks. "sh0-part1"
  }

  // 1) Transformér alle vagter til 1 eller 2 “interne” dele
  const internalShifts: IInternalShift[] = [];

  shifts.forEach((shift, idx) => {
    const startLocal  = shift.startTime;
    const endLocal    = shift.endTime;
    const startDayIdx = getDayIndex(startLocal);
    const endDayIdx   = getDayIndex(endLocal);

    const startHourDec = startLocal.hour + startLocal.minute / 60;
    const endHourDec   = endLocal.hour + endLocal.minute / 60;

    // A) Samme dag
    if (
      startDayIdx >= 0 &&
      startDayIdx <= 6 &&
      startDayIdx === endDayIdx
    ) {
      internalShifts.push({
        dayIndex:     startDayIdx,
        startHourDec: startHourDec,
        endHourDec:   endHourDec,
        teamName:     shift.teamName,
        isOverlap:    shift.isOverlap ?? false,
        theme:        shift.theme,
        keyBase:      `sh${idx}-part1`,
      });
    }
    // B) Overnats‐vagt → splittes i to
    else {
      // B1) Første del: fra start → midnat
      if (startDayIdx >= 0 && startDayIdx <= 6) {
        internalShifts.push({
          dayIndex:     startDayIdx,
          startHourDec: startHourDec,
          endHourDec:   24,
          teamName:     shift.teamName,
          isOverlap:    shift.isOverlap ?? false,
          theme:        shift.theme,
          keyBase:      `sh${idx}-part1`,
        });
      }
      // B2) Anden del: fra midnat → slut
      const endsAtMidnight = endLocal.hour === 0 && endLocal.minute === 0;
      if (endDayIdx >= 0 && endDayIdx <= 6 && !endsAtMidnight) {
        internalShifts.push({
          dayIndex:     endDayIdx,
          startHourDec: 0,
          endHourDec:   endHourDec,
          teamName:     shift.teamName,
          isOverlap:    shift.isOverlap ?? false,
          theme:        shift.theme,
          keyBase:      `sh${idx}-part2`,
        });
      }
    }
  });

  // 2) Gruppér interne vagter pr. dag [0..6]
  const shiftsByDay: IInternalShift[][] = Array.from({ length: 7 }, () => []);
  internalShifts.forEach((intShift) => {
    shiftsByDay[intShift.dayIndex].push(intShift);
  });

  // 3) Beregn overlap‐slots pr. dag vha. Luxon Interval
  interface IOverlapSlot {
    slotIndex:  number;
    totalSlots: number;
  }
  const overlapMap: Map<string, IOverlapSlot> = new Map();

  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const dayShifts = shiftsByDay[dayIdx];
    dayShifts.sort((a, b) => a.startHourDec - b.startHourDec);

    const tracks: Interval[] = [];
    dayShifts.forEach((intShift) => {
      const interval = Interval.fromDateTimes(
        weekStart.plus({ days: dayIdx, hours: intShift.startHourDec }),
        weekStart.plus({ days: dayIdx, hours: intShift.endHourDec })
      );

      let assignedSlot = -1;
      for (let t = 0; t < tracks.length; t++) {
        if (!tracks[t].overlaps(interval)) {
          assignedSlot = t;
          break;
        }
      }
      if (assignedSlot < 0) {
        tracks.push(interval);
        assignedSlot = tracks.length - 1;
      } else {
        tracks[assignedSlot] = tracks[assignedSlot].union(interval);
      }

      const totalSlots = tracks.length;
      overlapMap.set(intShift.keyBase, {
        slotIndex:  assignedSlot,
        totalSlots: totalSlots,
      });
    });
  }

  // 4) Render
  return (
    <div className={styles.weekContainer}>
      {/* ------------------------------------------------------------ */}
      {/*  NAVIGATION + UGEOVERSKRIFT                                    */}
      {/* ------------------------------------------------------------ */}
      <div className={styles.toolbar}>
        <DefaultButton
          className={styles.navButton}
          onClick={goPreviousWeek}
          text="← Forrige uge"
        />
        <Text variant="large" className={styles.weekLabel}>
          {`Uge ${weekStart.weekNumber} (${weekStart.toFormat('dd/LL')} – ${weekStart
            .plus({ days: 6 })
            .toFormat('dd/LL')})`}
        </Text>
        <DefaultButton
          className={styles.navButton}
          onClick={goNextWeek}
          text="Næste uge →"
        />
        <DefaultButton
          className={styles.navButton}
          onClick={onRefresh}
          text="Opdater data"
        />
      </div>

      {/* ------------------------------------------------------------ */}
      {/*  DAGS‐HEADER (Mandag, Tirsdag … Søndag)                         */}
      {/* ------------------------------------------------------------ */}
      <div className={styles.headerRow}>
        <div className={styles.hourHeader} />
        {Array.from({ length: 7 }).map((_, idx) => {
          const day = weekStart.plus({ days: idx });
          return (
            <div key={idx} className={styles.dayHeader}>
              {day.toFormat('ccc, dd LLL yyyy')}
            </div>
          );
        })}
      </div>

      {/* ------------------------------------------------------------ */}
      {/*  LOADING / “INGEN VAGTER” / HOVEDGRID                          */}
      {/* ------------------------------------------------------------ */}
      {isLoading ? (
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <Spinner label="Indlæser vagter…" size={SpinnerSize.large} />
        </div>
      ) : allEmpty ? (
        <div className={styles.status}>Ingen vagter i denne uge 🎉</div>
      ) : (
        <div className={styles.hourGrid} style={{ height: WEEK_CONTAINER_HEIGHT_PX }}>
          {Array.from({ length: HOURS_IN_DAY }).map((_, hour) => {
            const gridRowStart = hour + 1;
            return (
              <React.Fragment key={`row-${hour}`}>
                {/* VENSTRESIDE: Hver times label */}
                <div
                  className={styles.hourLabel}
                  style={{
                    gridColumnStart: 1,
                    gridRowStart:    gridRowStart,
                  }}
                >
                  {hour.toString().padStart(2, '0')}:00
                </div>
                {/* TOMME DAGSKOLONNER */}
                {Array.from({ length: 7 }).map((_, dayIdx) => (
                  <div
                    key={`cell-${hour}-${dayIdx}`}
                    className={styles.dayColumn}
                    style={{
                      gridColumnStart: dayIdx + 2,
                      gridRowStart:    gridRowStart,
                    }}
                  />
                ))}
              </React.Fragment>
            );
          })}

          {/* 
            5) Opret én “dag‐container” pr. dag, der spænder over alle 24 rækker
               og er reference for absolut‐positionerede vagt‐bokse
          */}
          {Array.from({ length: 7 }).map((_, dayIdx) => {
            return (
              <div
                key={`day-cont-${dayIdx}`}
                className={styles.dayColumn}
                style={{
                  gridColumnStart: dayIdx + 2,
                  gridRowStart:    1,
                  gridRowEnd:      HOURS_IN_DAY + 1,
                  position:        'relative',
                  overflow:        'hidden',
                }}
              >
                {/* 6) Inde i hver dag‐container lægger vi vagter for netop denne dag */}
                {shiftsByDay[dayIdx].map((intShift) => {
                  const { slotIndex, totalSlots } = overlapMap.get(intShift.keyBase)!;

                  // 1) Beregn “rå” width- & left-værdier i procent
                  let widthPercent: number;
                  let leftPercent:  number;
                  if (totalSlots === 1) {
                    widthPercent = 80;
                    leftPercent  = 0; // Centrér én vagt
                  } else {
                    widthPercent = 85 / totalSlots;
                    leftPercent  = slotIndex * widthPercent;
                  }

                  // 2) Clamp i bredden: sikre at left+width ≤ 100
                  if (leftPercent + widthPercent > 100) {
                    widthPercent = 100 - leftPercent;
                  }
                  // Hvis leftPercent > 100 (for sikkerhed)
                  if (leftPercent > 100) {
                    leftPercent  = 100;
                    widthPercent = 0;
                  }

                  // 3) Clamp start & end til [0..24] i højden
                  let startH = intShift.startHourDec;
                  let endH   = intShift.endHourDec;
                  if (startH < 0)   startH = 0;
                  if (startH > 24)  startH = 24;
                  if (endH < 0)     endH   = 0;
                  if (endH > 24)    endH   = 24;
                  if (endH <= startH) {
                    return null;
                  }

                  const topPx    = startH * pixelsPerHour;
                  const heightPx = (endH - startH) * pixelsPerHour;

                  const baseClassName = intShift.isOverlap
                    ? styles.shiftOverlap
                    : styles.shiftBlock;

                  // CamelCase lookup af tema‐klasse
                  const rawTheme = intShift.theme; // fx "green", "darkPink", "yellow"
                  const key = `theme${rawTheme.charAt(0).toUpperCase()}${rawTheme.slice(1)}`;
                  const themeClassName: string = (styles as any)[key] || '';

                  // Formatter tids‐tekst
                  const formatPeriod = () => {
                    const formatTime = (hourDec: number): string => {
                      const h = Math.floor(hourDec);
                      const m = Math.round((hourDec - h) * 60);
                      return `${h.toString().padStart(2, '0')}:${m
                        .toString()
                        .padStart(2, '0')}`;
                    };
                    const startText = formatTime(startH);
                    const endText   = endH === 24 ? '24:00' : formatTime(endH);
                    return `${startText} – ${endText}`;
                  };

                  return (
                    <div
                      key={intShift.keyBase}
                      className={`${baseClassName} ${themeClassName}`}
                      style={{
                        position: 'absolute',
                        top:      `${topPx}px`,
                        height:   `${heightPx}px`,
                        width:    `${widthPercent}%`,
                        left:     `${leftPercent}%`,
                      }}
                    >
                      <div className={styles.shiftInfo}>
                        <div className={styles.shiftTime}>{formatPeriod()}</div>
                        <div className={styles.shiftTeam}>{intShift.teamName}</div>
                      </div>
                      {intShift.isOverlap && (
                        <i className={styles.overlapIcon} title="Overlapper med anden vagt">
                          ⚠
                        </i>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default WeekCalendar;
