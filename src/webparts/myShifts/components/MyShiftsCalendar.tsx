// src/webparts/myShifts/components/MyShiftsCalendar.tsx

import * as React from 'react';
import { DateTime } from 'luxon';
import { MSGraphClientV3 } from '@microsoft/sp-http';
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { DefaultButton } from '@fluentui/react/lib/Button';

// 1) Importér print‐CSS (skal bruge “module.scss”‐suffix)
import '../PrintOverrides.scss';

import { getShiftsForDay, IShift } from '../services/ShiftsService';

// ────────────────────────────────────────────────────────────────
// Props‐interface – gør navnet tilgængeligt for MyShiftsWebPart
// ────────────────────────────────────────────────────────────────
export interface IMyShiftsCalendarProps {
  graphClient: MSGraphClientV3;  // Graph‐klienten installeret i onInit
  userId:      string;           // Azure AD objectId (GUID) eller “me”
  tz:          string;           // IANA‐tidszone, f.eks. “Europe/Copenhagen”
}

// ────────────────────────────────────────────────────────────────
// React‐komponent: Kalender‐view, der viser dagens vagter
// ────────────────────────────────────────────────────────────────
export const MyShiftsCalendar: React.FC<IMyShiftsCalendarProps> = (props) => {
  const { graphClient, userId, tz } = props;

  // ─── Lokal state ────────────────────────────────────────────────
  const [day, setDay]       = React.useState(DateTime.now().setZone(tz));
  const [shifts, setShifts] = React.useState<IShift[]>([]);
  const [busy, setBusy]     = React.useState<boolean>(false);
  const [error, setError]   = React.useState<string | null>(null);

  // ─── Funktion til at hente vagter for den valgte dag ─────────────
  const loadShifts = React.useCallback(
    async (targetDay: DateTime): Promise<void> => {
      setBusy(true);
      setError(null);

      try {
        // Hent kun brugerens egne vagter for præcis 'targetDay'
        const result = await getShiftsForDay(graphClient, targetDay, userId);
        setShifts(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        console.error(e);
      } finally {
        setBusy(false);
      }
    },
    [graphClient, userId]
  );

  // ─── Kør loadShifts, når 'day' ændres ─────────────────────────────
  React.useEffect(() => {
    loadShifts(day).catch((e) => console.error('Fejl i loadShifts:', e));
  }, [day, loadShifts]);

  // ─── Navigation: skift dag med pilene ─────────────────────────────
  const navigateDay = (deltaDays: number): void => {
    setDay((current) => current.plus({ days: deltaDays }));
  };

  // Formatter ISO‐string til “HH:mm”
  const formatHour = (isoString: string): string =>
    DateTime.fromISO(isoString).setZone(tz).toFormat('HH:mm');

  // ────────────────────────────────────────────────────────────────
  return (
    // 2) Print wrapper: ALT, der skal printes, skal ligge i #printArea
    <div id="printArea">
      {/* 3) Print‐knap – ligger altid foran kalender‐UI */}
      <div style={{ textAlign: 'right', marginBottom: '1rem' }}>
        <DefaultButton text="Print" onClick={() => window.print()} />
      </div>

      {/* 4) Navigation + Dato‐overskrift */}
      <Stack tokens={{ childrenGap: 16 }}>
        <Stack horizontal tokens={{ childrenGap: 12 }} verticalAlign="center">
          <DefaultButton text="←" onClick={() => navigateDay(-1)} />
          <Text variant="large">
            {day.toLocaleString(DateTime.DATE_FULL)}
          </Text>
          <DefaultButton text="→" onClick={() => navigateDay(1)} />
        </Stack>

        {/* 5) Status/fejl/”Ingen vagter” */}
        {busy && <Text>Indlæser …</Text>}
        {error && (
          <Text variant="small" styles={{ root: { color: 'red' } }}>
            Fejl: {error}
          </Text>
        )}
        {!busy && !error && shifts.length === 0 && (
          <Text>Ingen vagter i dag 🎉</Text>
        )}

        {/* 6) Liste af vagter */}
        {!busy &&
          !error &&
          shifts.map((s) => (
            <Stack
              key={s.id}
              horizontal
              tokens={{ childrenGap: 16 }}
              styles={{
                root: {
                  border:       '1px solid #ddd',
                  borderRadius: 4,
                  padding:      12,
                  alignItems:   'center',
                },
              }}
            >
              {/* 6.a) Tidsinterval */}
              <Text styles={{ root: { width: 100, fontWeight: 600 } }}>
                {formatHour(s.sharedShift.startDateTime)} –{' '}
                {formatHour(s.sharedShift.endDateTime)}
              </Text>

              {/* 6.b) Team + planlægningsgruppe */}
              <Stack>
                <Text variant="small">
                  Team: {s.teamInfo?.displayName ?? s.teamId}
                </Text>
                <Text variant="small">
                  Gruppe: {s.schedulingGroupInfo?.displayName ?? '—'}
                </Text>
              </Stack>
            </Stack>
          ))}
      </Stack>
    </div>
  );
};

export default MyShiftsCalendar;
