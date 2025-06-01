// src/webparts/myShifts/services/ShiftsService.ts
import { MSGraphClientV3 } from '@microsoft/sp-http';
import { PnPClientStorage, dateAdd } from '@pnp/core';
import { DateTime } from 'luxon';

const storage = new PnPClientStorage().session;
const TTL_MINUTES = 5;

export interface IShift {
  id: string;
  teamId: string;
  teamInfo?: {
    teamId: string;
    displayName: string;
  };
  schedulingGroupInfo?: {
    schedulingGroupId: string;
    displayName: string;
    code?: string | null;
  };
  sharedShift: {
    startDateTime: string;
    endDateTime: string;
    theme?: string;
    displayName?: string;
    notes?: string | null;
  };
}

/**
 * Henter alle vagt‐forekomster for den angivne lokale dag (almindelige vagter).
 * 🔹 Bruger `/me/joinedTeams/getShifts`
 * 🔹 Caches resultatet i sessionStorage i 5 minutter
 */
export async function getShiftsForDay(
  graph: MSGraphClientV3,
  day: DateTime,
  userObjectId: string
): Promise<IShift[]> {
  const cacheKey = `shifts-${day.toISODate()}-${userObjectId}`;

  const data = await storage.getOrPut<IShift[]>(
    cacheKey,
    async () => {
      // Hent én dag før og én dag efter på UTC, for at kunne navigere uden ekstra kald.
      const startUtc = day
        .minus({ days: 1 })
        .startOf('day')
        .toUTC()
        .toISO({ suppressMilliseconds: true });
      const endUtc = day
        .plus({ days: 1 })
        .endOf('day')
        .toUTC()
        .toISO({ suppressMilliseconds: true });

      const filter = [
        `sharedShift/startDateTime ge '${startUtc}'`,
        `sharedShift/endDateTime   le '${endUtc}'`,
        `userId eq '${userObjectId}'`
      ].join(' and ');

      const res = await graph
        .api('/me/joinedTeams/getShifts')
        .version('beta')
        .filter(filter)
        .top(500)
        .get<{ value: IShift[] }>();

      return res.value ?? [];
    },
    dateAdd(new Date(), 'minute', TTL_MINUTES)
  );

  // Trim til præcis inden for selve døgnet
  const startDayUtc = day.startOf('day').toUTC();
  const endDayUtc = day.endOf('day').toUTC();

  return data.filter((s) => {
    const st = DateTime.fromISO(s.sharedShift.startDateTime);
    const et = DateTime.fromISO(s.sharedShift.endDateTime);
    return st < endDayUtc && et > startDayUtc;
  });
}
