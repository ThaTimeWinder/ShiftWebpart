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
    theme?:        string;  // (valgfrit, hvis du vil viderebringe tema)
  };
}

/**
 * Henter vagter for én lokal dag (inkl. vagter, der overlapper midnat).
 * Hvis userObjectId er tom (''), udelades "userId eq" fra filteret, så Graph henter egne vagter.
 * Hvis userObjectId er en GUID, tilføjes "userId eq '{GUID}'" i filteret for at hente en anden brugers vagter.
 * Data caches i sessionStorage i 5 minutter pr. dag+brugerguid.
 *
 * @param graph         En instans af MSGraphClientV3 (SPFx).
 * @param day           Luxon DateTime for den ønskede dag (lokal tid).
 * @param userObjectId  GUID på den bruger, vi vil hente vagter for; hvis tom streng, hentes egne vagter.
 */
export async function getShiftsForDay(
  graph: MSGraphClientV3,
  day: DateTime,
  userObjectId: string  // Hvis tom streng = hent egne vagter (ingen userId i filter)
): Promise<IShift[]> {
  // 1) Cache‐nøgle inkluderer både dato og userObjectId (evt. tom streng)
  const cacheKey = `shifts-${day.toISODate()}-${userObjectId}`;

  // 2) Hent (eller gem hvis ikke i cache)
  const data = await storage.getOrPut<IShift[]>(
    cacheKey,
    async () => {
      // 2.a) Beregn ét døgn ekstra før/efter i UTC (så vi fanger overlap)
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

      // 2.b) Build filter‐dele på tidsinterval + evt. userId
      const filterParts: string[] = [
        `sharedShift/startDateTime ge ${startUtc}`,
        `sharedShift/endDateTime   le ${endUtc}`
      ];
      // Kun tilføj "userId eq '…'" hvis vi har en GUID
      if (userObjectId) {
        filterParts.push(`userId eq '${userObjectId}'`);
      }
      const filterStr = filterParts.join(' and ');

      // 2.c) Kald Graph‐endpointet /me/joinedTeams/getShifts med det dynamiske filter
      const res = await graph
        .api('/me/joinedTeams/getShifts')
        .version('beta')
        .filter(filterStr)
        .top(500)
        .get();

      return (res.value ?? []) as IShift[];
    },
    // Cache‐udløb: nu + 5 minutter
    dateAdd(new Date(), 'minute', TTL_MINUTES)
  );

  // 3) Filtrér kun vagter, der overlapper "day" (præcist UTC-interval)
  const startDayUtc = day.startOf('day').toUTC();
  const endDayUtc   = day.endOf('day').toUTC();

  return data.filter((s) => {
    const st = DateTime.fromISO(s.sharedShift.startDateTime, { zone: 'utc' });
    const et = DateTime.fromISO(s.sharedShift.endDateTime,   { zone: 'utc' });
    return st < endDayUtc && et > startDayUtc;
  });
}
