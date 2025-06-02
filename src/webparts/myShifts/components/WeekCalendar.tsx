// src/webparts/myShifts/components/WeekCalendar.tsx

import * as React from 'react';
// Bemærk: I nyere SPFx-projekter skal man importere fra '@fluentui/react' fremfor 'office-ui-fabric-react'
import { DefaultButton, Text } from '@fluentui/react';
import { DateTime } from 'luxon';
import styles from './WeekCalendar.module.scss';

export interface IShift {
  /** Luxon DateTime for vagtens start (skal være i samme uge som weekStart) */
  startTime: DateTime;
  /** Luxon DateTime for vagtens slut (samme dag eller evt. næste dag; vi kapper ved ugesluttidspunktet) */
  endTime: DateTime;
  /** Navnet på team/afdeling, der vises inde i boksen */
  teamName: string;
  /** Hvis true, bruger vi styles.shiftOverlap i stedet for styles.shiftBlock */
  isOverlap?: boolean;
}

export interface IWeekCalendarProps {
  /** Starten af ugen (et Luxon DateTime, fx mandag kl. 00:00) */
  weekStart: DateTime;
  /** Liste af vagter (IShift) inden for den givne uge */
  shifts: IShift[];
  /** Hvis true: vis kun teksten “Ingen vagter…” */
  allEmpty: boolean;
  /** Callback: brugeren klikker “Forrige uge” */
  goPreviousWeek: () => void;
  /** Callback: brugeren klikker “Næste uge” */
  goNextWeek: () => void;
}

const HOURS_IN_DAY = 24;
/** Skal matche height: 800px i WeekCalendar.module.scss (.weekContainer) */
const WEEK_CONTAINER_HEIGHT_PX = 800;

const WeekCalendar: React.FC<IWeekCalendarProps> = ({
  weekStart,
  shifts,
  allEmpty,
  goPreviousWeek,
  goNextWeek,
}) => {
  // Hvis der ingen vagter er, returner tidlig “status”-meddelelse
  if (allEmpty) {
    return <div className={styles.status}>Ingen vagter i denne uge 🎉</div>;
  }

  // Hvor mange pixels svarer én time til?
  const pixelsPerHour = WEEK_CONTAINER_HEIGHT_PX / HOURS_IN_DAY;

  /**
   * Beregn dag‐index (0–6) ud fra et Luxon DateTime og ugens start.
   * weekStart skal være fx mandag i begyndelsen af ugen.
   * Resultatet klampses til [0..6], så vagter uden for uge ikke fejer alt sammen.
   */
  const getDayIndex = (dt: DateTime): number => {
    const diff = dt
      .startOf('day')
      .diff(weekStart.startOf('day'), 'days').days;
    return Math.max(0, Math.min(6, Math.floor(diff)));
  };

  return (
    <div className={styles.weekContainer}>
      {/* -------------------------------------------------- */}
      {/* 1) NAVIGATION + UGEOVERSKRIFT                      */}
      {/* -------------------------------------------------- */}
      <div className={styles.toolbar}>
        <DefaultButton
          className={styles.navButton}
          onClick={goPreviousWeek}
          text="← Forrige uge"
        />
        <Text variant="large" className={styles.weekLabel}>
          {`Uge ${weekStart.weekNumber} (${weekStart.toFormat(
            'dd/LL'
          )} – ${weekStart.plus({ days: 6 }).toFormat('dd/LL')})`}
        </Text>
        <DefaultButton
          className={styles.navButton}
          onClick={goNextWeek}
          text="Næste uge →"
        />
      </div>

      {/* -------------------------------------------------- */}
      {/* 2) HEADER: Klokkeslæt + Dagsnavne                  */}
      {/* -------------------------------------------------- */}
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

      {/* -------------------------------------------------- */}
      {/* 3) HOVEDGRID: 24 rækker × 8 kolonner                */}
      {/* -------------------------------------------------- */}
      <div className={styles.hourGrid} style={{ height: WEEK_CONTAINER_HEIGHT_PX }}>
        {/**
         * 3.a) Baggrundsceller – Selve time‐ og dagsrasteret:
         *     - I kolonne 1: vise klokkeslæt (00:00–23:00).
         *     - I kolonne 2–8: tomme dagceller (for grid‐baggrund mm.).
         */}
        {Array.from({ length: HOURS_IN_DAY }).map((_, hour) => {
          const gridRowStart = hour + 1; // CSS-grid rækker tæller fra 1
          return (
            <React.Fragment key={`row-${hour}`}>
              {/* VENSTRESIDE: Time‐label */}
              <div
                className={styles.hourLabel}
                style={{
                  gridColumnStart: 1,
                  gridRowStart: gridRowStart,
                }}
              >
                {hour.toString().padStart(2, '0')}:00
              </div>

              {/* DAGSKOLONNER (tomme ”celler”) */}
              {Array.from({ length: 7 }).map((_, dayIdx) => (
                <div
                  key={`cell-${hour}-${dayIdx}`}
                  className={styles.dayColumn}
                  style={{
                    gridColumnStart: dayIdx + 2, // kolonne 2 = mandag, 3 = tirsdag osv.
                    gridRowStart: gridRowStart,
                  }}
                />
              ))}
            </React.Fragment>
          );
        })}

        {/**
         * 3.b) Tegn vagterne som absolut‐placerede bokse ovenpå grid‐baggrunden:
         *     - Beregn ‘top’ og ‘height’ i px
         *     - Beregn ‘gridColumnStart’ (dag‐kolonne)
         *     - Sæt eventuelt shiftOverlap‐klasse, hvis isOverlap === true
         */}
        {shifts.map((shift, index) => {
          const startHourDec =
            shift.startTime.hour + shift.startTime.minute / 60;
          const endHourDec = shift.endTime.hour + shift.endTime.minute / 60;

          // Hvor mange px fra toppen af hourGrid containeren
          const topPx = startHourDec * pixelsPerHour;
          // Hvor høj boksen skal være
          const heightPx = (endHourDec - startHourDec) * pixelsPerHour;

          // Beregn dagIndex (0–6)
          const dayIndex = getDayIndex(shift.startTime);

          // Vælg klasse: enten .shiftBlock eller .shiftOverlap
          const blockClass = shift.isOverlap
            ? styles.shiftOverlap
            : styles.shiftBlock;

          return (
            <div
              key={`shift-${index}`}
              className={blockClass}
              style={{
                top: `${topPx}px`,
                height: `${heightPx}px`,
                gridColumnStart: dayIndex + 2,
              }}
            >
              <div className={styles.shiftInfo}>
                <div className={styles.shiftTime}>
                  {shift.startTime.toFormat('HH:mm')} –{' '}
                  {shift.endTime.toFormat('HH:mm')}
                </div>
                <div className={styles.shiftTeam}>{shift.teamName}</div>
              </div>
              {shift.isOverlap && (
                <i className={styles.overlapIcon} title="Overlapper med anden vagt">
                  ⚠
                </i>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WeekCalendar;
