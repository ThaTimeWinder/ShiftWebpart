// src/webparts/myShifts/MyShiftsWebPart.tsx

import * as React from 'react';
import * as ReactDom from 'react-dom';

import { Version } from '@microsoft/sp-core-library';
import {
  BaseClientSideWebPart,
  IPropertyPaneConfiguration,
} from '@microsoft/sp-webpart-base';
import {
  IPropertyPaneDropdownOption,
  PropertyPaneDropdown,
} from '@microsoft/sp-property-pane';
import { MSGraphClientV3 } from '@microsoft/sp-http';
import { DateTime } from 'luxon';

import MyShiftsCalendar from './components/MyShiftsCalendar';
import WeekCalendar, {
  IShift as IComponentShift,
  IWeekCalendarProps,
} from './components/WeekCalendar';

// Importér jeres “raw” service‐IShift, som indeholder `sharedShift.startDateTime` osv.
import { IShift as IServiceShift, getShiftsForDay } from './services/ShiftsService';

export interface IMyShiftsWebPartProps {
  viewMode: 'day' | 'week';
}

export default class MyShiftsWebPart extends BaseClientSideWebPart<IMyShiftsWebPartProps> {
  private _graphClient!: MSGraphClientV3;
  private _userObjectId!: string;

  /** Den aktuelle uges start på mandags midnat (Locale‐tid). */
  private _currentWeekStart: DateTime = DateTime.local()
    .startOf('week')
    .plus({ days: 1 }); // Luxon: startOf('week') = søndag, så +1 = mandag.

  /** Liste af mapperede vagter (til WeekCalendar) i den uge, vi skal vise */
  private _shiftsForWeek: IComponentShift[] = [];

  public async onInit(): Promise<void> {
    // 1) Hent MSGraphClientV3 fra SPFx‐konteksten
    this._graphClient = await this.context.msGraphClientFactory.getClient('3');
    // 2) Hent Azure AD objectId fra konteksten
    this._userObjectId = this.context.pageContext.aadInfo.userId!;

    // 3) Hent første uges vagter via vores private loader‐funktion
    await this._loadShiftsForWeek(this._currentWeekStart);
  }

  /**
   * Henter vagter for hele ugen [mandag .. søndag] i to trin:
   *  A) Kalder getShiftsForDay(...) for hver enkelt dag
   *  B) Mapper service‐IShift (med 'sharedShift.startDateTime') til komponent‐IShift,
   *     hvor startTime/endTime er Luxon‐DateTime, og teamName hentes fra teamInfo eller schedulingGroupInfo.
   */
  private async _loadShiftsForWeek(weekStart: DateTime): Promise<void> {
    // Midlertidigt array til “rå” servicevagter
    const allServiceShifts: IServiceShift[] = [];

    // 1) Løb gennem dagene mandag (i = 0) → søndag (i = 6)
    for (let i = 0; i < 7; i++) {
      const singleDay: DateTime = weekStart.plus({ days: i });
      try {
        // Hent alle vagter, der overlapper “singleDay” via jeres service‐funktion
        const shiftsForDay: IServiceShift[] = await getShiftsForDay(
          this._graphClient,
          singleDay,
          this._userObjectId
        );

        // Tilføj dem alle til det kumulative array
        allServiceShifts.push(...shiftsForDay);
      } catch (err) {
        console.error(`Fejl ved hent af vagter for dag ${singleDay.toISODate()}:`, err);
      }
    }

    // 2) Mapper fra “service‐IShift” til “komponent‐IShift”:
    //    - Fra sharedShift.startDateTime (UTC ISO) → lokale DateTime
    //    - Fra sharedShift.endDateTime (UTC ISO) → lokale DateTime
    //    - teamName: Brug schedulingGroupInfo.displayName eller teamInfo.displayName
    //    - isOverlap: sæt false her; WeekCalendar kan alligevel beregne overlap (eller I kan sætte det i tast)
    const mapped: IComponentShift[] = allServiceShifts.map((srv) => {
      const startUtc = DateTime.fromISO(srv.sharedShift.startDateTime, { zone: 'utc' });
      const endUtc = DateTime.fromISO(srv.sharedShift.endDateTime, { zone: 'utc' });

      // Konverter til brugerens lokale tidszone
      const startLocal = startUtc.setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
      const endLocal = endUtc.setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);

      // Vælg team‐navn: hvis schedulingGroupInfo findes, brug displayName, ellers teamInfo.displayName
      let teamName = 'Ukendt team';
      if (srv.schedulingGroupInfo && srv.schedulingGroupInfo.displayName) {
        teamName = srv.schedulingGroupInfo.displayName;
      } else if (srv.teamInfo && srv.teamInfo.displayName) {
        teamName = srv.teamInfo.displayName;
      }

      // TODO: Hvis I vil markere overlappende vagter, kan I detektere overlap her og sætte isOverlap = true.
      //       Men hvis WeekCalendar selv kan vise overlap (ved at bruge shiftOverlap‐klasse),
      //       kan I blot sætte isOverlap=false her og overlappet håndtere i WeekCalendar.
      const isOverlap = false;

      return {
        startTime: startLocal,
        endTime: endLocal,
        teamName: teamName,
        isOverlap: isOverlap,
      } as IComponentShift;
    });

    // 3) Gem de mapperede vagter i feltet _shiftsForWeek
    this._shiftsForWeek = mapped;

    // 4) Trigger re-render af webpart, så WeekCalendar får opdateret data
    this.render();
  }

  public render(): void {
    // De tre “dagvisnings‐props” (sharedCalProps) som MyShiftsCalendar bruger
    const sharedCalProps = {
      graphClient: this._graphClient,
      userId: this._userObjectId,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    let element: React.ReactElement;

    if (this.properties.viewMode === 'week') {
      // Byg de props, WeekCalendar kræver i sin interface:
      const weekProps: IWeekCalendarProps = {
        weekStart: this._currentWeekStart,
        shifts: this._shiftsForWeek,
        allEmpty: this._shiftsForWeek.length === 0,
        goPreviousWeek: this._goPreviousWeek.bind(this),
        goNextWeek: this._goNextWeek.bind(this),
      };

      element = <WeekCalendar {...weekProps} />;
    } else {
      // Dagvisning: send blot de sharedCalProps til MyShiftsCalendar
      element = <MyShiftsCalendar {...sharedCalProps} />;
    }

    ReactDom.render(element, this.domElement);
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  /**
   * “Forrige uge”-knap: flyt 7 dage tilbage, hent data til den nye uge og rerender
   */
  private async _goPreviousWeek(): Promise<void> {
    this._currentWeekStart = this._currentWeekStart.minus({ days: 7 });
    await this._loadShiftsForWeek(this._currentWeekStart);
  }

  /**
   * “Næste uge”-knap: flyt 7 dage frem, hent data til den nye uge og rerender
   */
  private async _goNextWeek(): Promise<void> {
    this._currentWeekStart = this._currentWeekStart.plus({ days: 7 });
    await this._loadShiftsForWeek(this._currentWeekStart);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    const dropdownOptions: IPropertyPaneDropdownOption[] = [
      { key: 'day', text: 'Dagvisning' },
      { key: 'week', text: 'Ugekalender' },
    ];

    return {
      pages: [
        {
          header: {
            description: 'Vælg visning',
          },
          groups: [
            {
              groupName: 'Opsætning',
              groupFields: [
                PropertyPaneDropdown('viewMode', {
                  label: 'Visningstype',
                  options: dropdownOptions,
                }),
              ],
            },
          ],
        },
      ],
    };
  }
}
