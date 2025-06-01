// src/webparts/myShifts/components/MyShiftsCalendar.tsx
import * as React from 'react';
import { DateTime } from 'luxon';
import { MSGraphClientV3 } from '@microsoft/sp-http';
import { Stack, Text, DefaultButton, Icon } from '@fluentui/react';

import { getShiftsForDay, getOpenShiftsForDay, IShift, IOpenShift } from '../services/ShiftsService';
import styles from './MyShiftsCalendar.module.scss';

export interface IMyShiftsCalendarProps {
  graphClient: MSGraphClientV3;
  userId: string;
  tz: string;
  viewMode: 'day' | 'week'; // enten "day" eller "week"
}

const MyShiftsCalendar: React.FC<IMyShiftsCalendarProps> = (props) => {
  const { graphClient, userId, tz } = props;

  const [day, setDay] = React.useState<DateTime>(DateTime.now().setZone(tz));
  const [shifts, setShifts] = React.useState<(IShift | IOpenShift)[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadShifts = React.useCallback(
    async (targetDay: DateTime) => {
      setLoading(true);
      setError(null);
      try {
        // Hent normale vagter
        const realShifts: IShift[] = await getShiftsForDay(graphClient, targetDay, userId);

        // Find unikke teamIds fra dagens vagter
        const uniqueTeamIds = Array.from(new Set(realShifts.map(s => s.teamId)));

        // Hent openShifts for hver team
        const openPromises: Promise<IOpenShift[]>[] = uniqueTeamIds.map(teamId =>
          getOpenShiftsForDay(graphClient, targetDay, teamId)
        );
        const openResults = await Promise.all(openPromises);
        const openShifts: IOpenShift[] = openResults.reduce((acc, curr) => acc.concat(curr), []);

        // Udvid realShifts med nødvendige felter
        const realWithMeta: (IShift | IOpenShift)[] = realShifts.map(s => ({
          ...s,
          teamInfo: s.teamInfo,
          schedulingGroupInfo: s.schedulingGroupInfo,
          sharedShift: {
            ...s.sharedShift,
            theme: s.sharedShift.theme ?? 'darkPink',
            displayName: s.sharedShift.displayName ?? ''
          },
          isOpenShift: false as false
        }));

        // Udvid openShifts med nødvendige felter
        const openWithMeta: (IShift | IOpenShift)[] = openShifts.map(o => ({
          ...o,
          teamInfo: { teamId: o.teamId, displayName: o.teamInfo?.displayName ?? o.teamId },
          schedulingGroupInfo: {
            schedulingGroupId: o.schedulingGroupInfo?.schedulingGroupId ?? '',
            displayName: o.schedulingGroupInfo?.displayName ?? 'Ledig vagt',
            code: null
          },
          sharedShift: {
            ...o.sharedShift,
            theme: 'lightGray',
            displayName: 'Ledig vagt'
          },
          isOpenShift: true as true
        }));

        setShifts([...realWithMeta, ...openWithMeta]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [graphClient, userId]
  );

  React.useEffect(() => {
    loadShifts(day).catch(console.error);
  }, [day, loadShifts]);

  const navigateDay = (daysDelta: number): void => {
    setDay(current => current.plus({ days: daysDelta }));
  };

  const formatHour = (isoString: string): string =>
    DateTime.fromISO(isoString).setZone(tz).toFormat('HH:mm');

  return (
    <Stack tokens={{ childrenGap: 16 }} className={styles.container}>
      <Stack horizontal tokens={{ childrenGap: 12 }} verticalAlign="center">
        <DefaultButton
          className={styles.navButton}
          onClick={() => navigateDay(-1)}
          text="←"
        />
        <Text variant="large" className={styles.dateText}>
          {day.toFormat('cccc, dd LLLL yyyy')}
        </Text>
        <DefaultButton
          className={styles.navButton}
          onClick={() => navigateDay(1)}
          text="→"
        />
      </Stack>

      {loading && <Text className={styles.loadingText}>Indlæser vagter…</Text>}
      {error && (
  <Text className={styles.errorText}>
    Fejl: {error}
  </Text>
)}

      {!loading && !error && shifts.length === 0 && (
        <Text className={styles.emptyText}>Ingen vagter i dag 🎉</Text>
      )}

      {!loading &&
        !error &&
        shifts.map(s => {
          const isOpen = (s as IOpenShift).isOpenShift === true;
          return (
            <Stack
              key={s.id}
              horizontal
              tokens={{ childrenGap: 16 }}
              className={isOpen ? styles.openShiftRow : styles.realShiftRow}
            >
              <Text
                className={isOpen ? styles.openTimeText : styles.timeText}
              >
                {formatHour(s.sharedShift.startDateTime)} –{' '}
                {formatHour(s.sharedShift.endDateTime)}
              </Text>

              {!isOpen ? (
                <Stack className={styles.details}>
                  <Text variant="small">
                    Team: {s.teamInfo?.displayName}
                  </Text>
                  <Text variant="small">
                    Gruppe: {s.schedulingGroupInfo?.displayName}
                  </Text>
                </Stack>
              ) : (
                <Stack className={styles.details}>
                  <Icon iconName="Clock" className={styles.openIcon} />
                  <Text variant="small" className={styles.openText}>
                    Ledig vagt
                  </Text>
                </Stack>
              )}
            </Stack>
          );
        })}
    </Stack>
  );
};

export default MyShiftsCalendar;
