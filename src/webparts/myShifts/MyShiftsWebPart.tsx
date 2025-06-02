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
import { PnPClientStorage } from '@pnp/core'; // ← Importér PnPClientStorage

import MyShiftsCalendar from './components/MyShiftsCalendar';
import WeekCalendar, {
  IShift as IComponentShift,
  IWeekCalendarProps,
} from './components/WeekCalendar';

// Rå‐interface fra jeres service
import { IShift as IServiceShift, getShiftsForDay } from './services/ShiftsService';

export interface IMyShiftsWebPartProps {
  viewMode: 'day' | 'week';
}

export default class MyShiftsWebPart extends BaseClientSideWebPart<IMyShiftsWebPartProps> {
  private _graphClient!: MSGraphClientV3;
  private _userObjectId!: string;

  /** Ugens start på mandag kl. 00:00 (lokal tid) */
  private _currentWeekStart: DateTime = DateTime.local()
    .startOf('week')
    .plus({ days: 1 });

  /** Liste med alle mapperede vagter til WeekCalendar */
  private _shiftsForWeek: IComponentShift[] = [];

  /** Om vi indlæser vagter i øjeblikket */
  private _isLoading: boolean = false;

  public async onInit(): Promise<void> {
    this._graphClient = await this.context.msGraphClientFactory.getClient('3');
    this._userObjectId = this.context.pageContext.aadInfo.userId!;
    await this._loadShiftsForWeek(this._currentWeekStart);
  }

  /**
   * Henter vagter for uge [mandag..søndag]:
   *   1) Kalder getShiftsForDay for hver dag
   *   2) Mapper til komponent‐IShift
   */
  private async _loadShiftsForWeek(weekStart: DateTime): Promise<void> {
    // Marker “loading” og re-render straks
    this._isLoading = true;
    this.render();

    const allServiceShifts: IServiceShift[] = [];
    for (let i = 0; i < 7; i++) {
      const singleDay: DateTime = weekStart.plus({ days: i });
      try {
        const shiftsForDay: IServiceShift[] = await getShiftsForDay(
          this._graphClient,
          singleDay,
          this._userObjectId
        );
        allServiceShifts.push(...shiftsForDay);
      } catch (err) {
        console.error(`Fejl ved hent af vagter for dag ${singleDay.toISODate()}:`, err);
      }
    }

    const mapped: IComponentShift[] = allServiceShifts.map((srv) => {
      const startUtc = DateTime.fromISO(srv.sharedShift.startDateTime, { zone: 'utc' });
      const endUtc   = DateTime.fromISO(srv.sharedShift.endDateTime,   { zone: 'utc' });
      const tz       = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const startLocal = startUtc.setZone(tz);
      const endLocal   = endUtc.setZone(tz);

      let teamName = 'Ukendt team';
      if (srv.schedulingGroupInfo && srv.schedulingGroupInfo.displayName) {
        teamName = srv.schedulingGroupInfo.displayName;
      } else if (srv.teamInfo && srv.teamInfo.displayName) {
        teamName = srv.teamInfo.displayName;
      }

      // Hent Graph‐temaet (cast til any, da feltet ikke findes i IServiceShift-interface)
      const rawTheme = (srv.sharedShift as any).theme;
      const theme    = typeof rawTheme === 'string' ? rawTheme : 'white';

      return {
        startTime:  startLocal,
        endTime:    endLocal,
        teamName:   teamName,
        isOverlap:  false,
        theme:      theme,
      } as IComponentShift;
    });

    this._shiftsForWeek = mapped;
    this._isLoading = false;
    this.render();
  }

  public render(): void {
    const sharedCalProps = {
      graphClient: this._graphClient,
      userId:       this._userObjectId,
      tz:           Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    let element: React.ReactElement;

    if (this.properties.viewMode === 'week') {
      const weekProps: IWeekCalendarProps = {
        weekStart:      this._currentWeekStart,
        shifts:         this._shiftsForWeek,
        allEmpty:       this._shiftsForWeek.length === 0 && !this._isLoading,
        isLoading:      this._isLoading,
        goPreviousWeek: this._goPreviousWeek.bind(this),
        goNextWeek:     this._goNextWeek.bind(this),
        onRefresh:      this._refreshCurrentWeek.bind(this), // Nyt callback
      };
      element = <WeekCalendar {...weekProps} />;
    } else {
      element = <MyShiftsCalendar {...sharedCalProps} />;
    }

    ReactDom.render(element, this.domElement);
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  /** Gå 7 dage tilbage + hent data for den uge */
  private async _goPreviousWeek(): Promise<void> {
    this._currentWeekStart = this._currentWeekStart.minus({ days: 7 });
    await this._loadShiftsForWeek(this._currentWeekStart);
  }

  /** Gå 7 dage frem + hent data for den uge */
  private async _goNextWeek(): Promise<void> {
    this._currentWeekStart = this._currentWeekStart.plus({ days: 7 });
    await this._loadShiftsForWeek(this._currentWeekStart);
  }

  /**
   * Genindlæs data for den nuværende uge (kaldes fra “Opdater data”‐knappen).
   * Først sletter vi cache‐nøglerne for alle 7 dage i ugen, så getShiftsForDay
   * henter frisk data fra Graph i stedet for sessionStorage.
   */
  private async _refreshCurrentWeek(): Promise<void> {
    const storage = new PnPClientStorage().session;

    // Slet cache for hver dag i ugen
    for (let i = 0; i < 7; i++) {
      const date = this._currentWeekStart.plus({ days: i }).toISODate();
      const cacheKey = `shifts-${date}-${this._userObjectId}`;
      storage.delete(cacheKey);
    }

    // Hent så frisk data
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
          header: { description: 'Vælg visning' },
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
