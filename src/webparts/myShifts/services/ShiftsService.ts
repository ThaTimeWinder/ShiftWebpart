// src/webparts/myShifts/services/ShiftsService.ts
import { MSGraphClientV3 } from '@microsoft/sp-http';
import { PnPClientStorage, dateAdd } from '@pnp/core';
import { DateTime } from 'luxon';

// Session‐storage med 5 minutters TTL
const storage = new PnPClientStorage().session;
const TTL_MINUTES = 5;

/**
 * IShift‐interface: Kun de felter fra Graph‐responsen, som webdelen bruger.
 */
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
    startDateTime: string;  // UTC ISO‐8601
    endDateTime:   string;  // UTC ISO‐8601
  };
}

/**
 * Henter vagter for én lokal dag (inkl. vagter, der overlapper midnat).
 * Resultatet caches i sessionStorage i 5 minutter pr. dag+brugerguid.
 */
export async function getShiftsForDay(
  graph: MSGraphClientV3,
  day: DateTime,
  userObjectId: string
): Promise<IShift[]> {
  // Cache‐nøgle inkluderer både dato og bruger‐GUID
  const cacheKey = `shifts-${day.toISODate()}-${userObjectId}`;

  // Hent (eller gem hvis ikke i cache)
  const data = await storage.getOrPut<IShift[]>(
    cacheKey,
    async () => {
      // Hent én dag ekstra før/efter til overlap
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

      // Byg $filter for Graph: inkl. bruger‐GUID, start+slut
      const filter = [
        `sharedShift/startDateTime ge ${startUtc}`,
        `sharedShift/endDateTime   le ${endUtc}`,
        `userId eq '${userObjectId}'`,
      ].join(' and ');

      const res = await graph
        .api('/me/joinedTeams/getShifts')
        .version('beta')
        .filter(filter)
        .top(500)
        .get();

      return (res.value ?? []) as IShift[];
    },
    // Cache‐udløb: nu + 5 minutter
    dateAdd(new Date(), 'minute', TTL_MINUTES)
  );

  // Præcis dags‐interval i UTC (lokal midnat start og slut)
  const startDayUtc = day.startOf('day').toUTC();
  const endDayUtc = day.endOf('day').toUTC();

  // Returner kun vagter, der **overlapper** denne dag
  return data.filter((s) => {
    const st = DateTime.fromISO(s.sharedShift.startDateTime);
    const et = DateTime.fromISO(s.sharedShift.endDateTime);

    // Overlap = start før dagens slut AND slut efter dagens start
    return st < endDayUtc && et > startDayUtc;
  });
}
