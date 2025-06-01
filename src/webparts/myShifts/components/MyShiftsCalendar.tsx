// src/webparts/myShifts/components/MyShiftsCalendar.tsx
import * as React from 'react';
import { DateTime } from 'luxon';
import { MSGraphClientV3 } from '@microsoft/sp-http';
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { DefaultButton } from '@fluentui/react/lib/Button';

import { getShiftsForDay, IShift } from '../services/ShiftsService';

// ────────────────────────────────────────────────────────────────
// Props‐interface – gør navnet tilgængeligt for MyShiftsWebPart
// ────────────────────────────────────────────────────────────────
export interface IMyShiftsCalendarProps {
  graphClient: MSGraphClientV3;  // Graph‐klienten installeret i onInit
  userId: string;                // Azure AD objectId (GUID)
  tz: string;                    // IANA‐tidszone, fx "Europe/Copenhagen"
}

// ────────────────────────────────────────────────────────────────
// React‐komponent: Kalender‐view, der viser dagens vagter
// ────────────────────────────────────────────────────────────────
export const MyShiftsCalendar: React.FC<IMyShiftsCalendarProps> = (props) => {
  const { graphClient, userId, tz } = props;

  // ─── Lokal state ────────────────────────────────────────────────
  // 'day' holder den lokale dato, som brugeren navigerer til
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
        // Vis evt. fejl i UI, og log den til konsollen
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        console.error(e);
      } finally {
        setBusy(false);
      }
    },
    [graphClient, userId]
  );

  // ─── Kør loadShifts hele tiden, når 'day' ændres ───────────────────
  React.useEffect(() => {
    loadShifts(day).catch((e) => {
      // Sikre, at eventuelle utilsigtede fejl også fanges
      console.error('Fejl i loadShifts:', e);
    });
  }, [day, loadShifts]);

  // ─── Navigation: Skift dag med pilene ─────────────────────────────
  const navigateDay = (deltaDays: number): void => {
    setDay((current) => current.plus({ days: deltaDays }));
  };

  // Formaterer ISO‐string til "HH:mm", med brugerens tidszone
  const formatHour = (isoString: string): string =>
    DateTime.fromISO(isoString).setZone(tz).toFormat('HH:mm');

  // ────────────────────────────────────────────────────────────────
  return (
    <Stack tokens={{ childrenGap: 16 }}>
      {/* 1) Navigation med ← og → knapper  */}
      <Stack horizontal tokens={{ childrenGap: 12 }} verticalAlign="center">
        <DefaultButton text="←" onClick={(): void => navigateDay(-1)} />
        <Text variant="large">
          {day.toLocaleString(DateTime.DATE_FULL)}
        </Text>
        <DefaultButton text="→" onClick={(): void => navigateDay(1)} />
      </Stack>

      {/* 2) Indlæs‐status eller fejlmelding */}
      {busy && <Text>Indlæser …</Text>}
      {error && (
        <Text variant="small" styles={{ root: { color: 'red' } }}>
          Fejl: {error}
        </Text>
      )}

      {/* 3) Ingen vagter i dag */}
      {!busy && !error && shifts.length === 0 && (
        <Text>Ingen vagter i dag 🎉</Text>
      )}

      {/* 4) Liste af vagter */}
      {!busy &&
        !error &&
        shifts.map((s) => (
          <Stack
            key={s.id}
            horizontal
            tokens={{ childrenGap: 16 }}
            styles={{
              root: {
                border: '1px solid #ddd',
                borderRadius: 4,
                padding: 12,
                alignItems: 'center',
              },
            }}
          >
            {/* Tidsinterval */}
            <Text styles={{ root: { width: 100, fontWeight: 600 } }}>
              {formatHour(s.sharedShift.startDateTime)} – {formatHour(s.sharedShift.endDateTime)}
            </Text>

            {/* Oplysninger om team og planlægningsgruppe */}
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
  );
};

export default MyShiftsCalendar;
