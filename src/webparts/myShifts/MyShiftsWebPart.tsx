// src/webparts/myShifts/MyShiftsWebPart.tsx

import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import {
  BaseClientSideWebPart,
  IPropertyPaneConfiguration,
  IPropertyPaneField,
  IPropertyPaneDropdownOption,
  PropertyPaneDropdown,
  PropertyPaneToggle,
  PropertyPaneTextField,
  IPropertyPaneToggleProps,
  IPropertyPaneTextFieldProps
} from '@microsoft/sp-webpart-base';
import { MSGraphClientV3 } from '@microsoft/sp-http';
import { DateTime } from 'luxon';

import MyShiftsCalendar from './components/MyShiftsCalendar';
import WeekCalendar, {
  IShift as IComponentShift,
  IWeekCalendarProps
} from './components/WeekCalendar';

import { IShift as IServiceShift, getShiftsForDay } from './services/ShiftsService';

export interface IMyShiftsWebPartProps {
  viewMode:        'day' | 'week';
  superUserMode:   boolean;
  selectedUserId:  string;    // UPN eller GUID
}

export default class MyShiftsWebPart extends BaseClientSideWebPart<IMyShiftsWebPartProps> {
  private _graphClient!: MSGraphClientV3;
  private _loggedInUserGuid!: string;                // Den autentificerede brugers GUID
  private _selectedUserGuid: string = '';            // Opløst GUID, når bruger angiver UPN
  private _currentWeekStart: DateTime = DateTime.local()
    .startOf('week')
    .plus({ days: 1 }); // Luxon: startOf('week') = søndag → +1 = mandag
  private _shiftsForWeek: IComponentShift[] = [];
  private _isLoading: boolean = false;

  public async onInit(): Promise<void> {
    // 1) Hent en instans af MSGraphClientV3
    this._graphClient = await this.context.msGraphClientFactory.getClient('3');
    // 2) Hent den loggede‐ind brugerens GUID
    this._loggedInUserGuid = this.context.pageContext.aadInfo.userId!;
    // 3) Hvis der er en tidligere angivet selectedUserId, hent GUID nu
    if (this.properties.selectedUserId) {
      await this._resolveSelectedUserGuid(this.properties.selectedUserId);
    }
    // 4) Indlæs data for den aktuelle uge
    await this._loadShiftsForWeek(this._currentWeekStart);
  }

  /**
   * Hvis input allerede er GUID, gem det. Ellers antag UPN/mail and hent GUID fra Graph.
   */
  private async _resolveSelectedUserGuid(input: string): Promise<void> {
    const guidRegex = /^[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}$/;
    if (guidRegex.test(input)) {
      this._selectedUserGuid = input;
      return;
    }
    try {
      const user: any = await this._graphClient
        .api(`/users/${encodeURIComponent(input)}`)
        .version('v1.0')
        .select('id')
        .get();
      this._selectedUserGuid = user.id;
    } catch (error) {
      console.error(`Kunne ikke finde bruger for "${input}":`, error);
      this._selectedUserGuid = '';
    }
  }

  /**
   * Henter vagter for hele ugen [mandag..søndag]:
   * - Hvis superUserMode = true OG en valid GUID er opløst, bruger vi den GUID.
   * - Ellers hentes egne vagter ved at sende tom streng (som i ShiftsService betyder “egen bruger”).
   *
   * Vi kalder altid getShiftsForDay(graph, dag, effectiveUserGuid). Hvis effectiveUserGuid = '',
   * tilføjes der ikke “userId eq …” i filteret, så Graph returnerer kun egen brugers shifts.
   */
  private async _loadShiftsForWeek(weekStart: DateTime): Promise<void> {
    this._isLoading = true;
    this.render(); // Vis spinner straks

    try {
      const allServiceShifts: IServiceShift[] = [];
      for (let i = 0; i < 7; i++) {
        const singleDay = weekStart.plus({ days: i });
        const effectiveUserGuid =
          this.properties.superUserMode && this._selectedUserGuid
            ? this._selectedUserGuid
            : this._loggedInUserGuid;
        const shiftsForDay = await getShiftsForDay(
          this._graphClient,
          singleDay,
          effectiveUserGuid
        );
        allServiceShifts.push(...shiftsForDay);
      }

      this._shiftsForWeek = allServiceShifts.map((srv) => {
        const startUtc   = DateTime.fromISO(srv.sharedShift.startDateTime, { zone: 'utc' });
        const endUtc     = DateTime.fromISO(srv.sharedShift.endDateTime,   { zone: 'utc' });
        const startLocal = startUtc.setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
        const endLocal   = endUtc.setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);

        let teamName = 'Ukendt team';
        if (srv.schedulingGroupInfo?.displayName) {
          teamName = srv.schedulingGroupInfo.displayName;
        } else if (srv.teamInfo?.displayName) {
          teamName = srv.teamInfo.displayName;
        }

        const theme = srv.sharedShift.theme || 'blue';
        return {
          startTime: startLocal,
          endTime:   endLocal,
          teamName:  teamName,
          isOverlap: false,
          theme:     theme
        } as IComponentShift;
      });
    } catch (error) {
      console.error('Fejl ved hent af vagter for uge:', error);
      this._shiftsForWeek = [];
    } finally {
      this._isLoading = false;
      this.render();
    }
  }

  public render(): void {
    const sharedCalProps = {
      graphClient: this._graphClient,
      userId:      this._loggedInUserGuid,
      tz:          Intl.DateTimeFormat().resolvedOptions().timeZone
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
        onRefresh:      this._onRefresh.bind(this),
        superUserMode:  this.properties.superUserMode,
        selectedUserId: this.properties.selectedUserId,
        onUserSelected: async (newUserId: string) => {
          this.properties.selectedUserId = newUserId;
          await this._resolveSelectedUserGuid(newUserId);
          await this._loadShiftsForWeek(this._currentWeekStart);
        },
        graphClient:    this._graphClient
      };
      element = React.createElement(WeekCalendar, weekProps);
    } else {
      element = React.createElement(MyShiftsCalendar, sharedCalProps);
    }

    ReactDom.render(element, this.domElement);
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  private async _goPreviousWeek(): Promise<void> {
    this._currentWeekStart = this._currentWeekStart.minus({ days: 7 });
    await this._loadShiftsForWeek(this._currentWeekStart);
  }

  private async _goNextWeek(): Promise<void> {
    this._currentWeekStart = this._currentWeekStart.plus({ days: 7 });
    await this._loadShiftsForWeek(this._currentWeekStart);
  }

  /**
   * “Opdater data” fjerner cache for enten valgt bruger‐GUID eller egen GUID,
   * og genindlæser samme uge.
   */
  private async _onRefresh(): Promise<void> {
    const effectiveUserGuid =
      this.properties.superUserMode && this._selectedUserGuid
        ? this._selectedUserGuid
        : this._loggedInUserGuid;

    const weekDates: string[] = [];
    for (let i = 0; i < 7; i++) {
      weekDates.push(this._currentWeekStart.plus({ days: i }).toISODate()!);
    }
    weekDates.forEach((d) => {
      const cacheKey = `shifts-${d}-${effectiveUserGuid}`;
      window.sessionStorage.removeItem(cacheKey);
    });

    await this._loadShiftsForWeek(this._currentWeekStart);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    const dropdownOptions: IPropertyPaneDropdownOption[] = [
      { key: 'day', text: 'Dagvisning' },
      { key: 'week', text: 'Ugekalender' }
    ];

    const groupFields: IPropertyPaneField<any>[] = [
      PropertyPaneDropdown('viewMode', {
        label:   'Visningstype',
        options: dropdownOptions
      }),
      PropertyPaneToggle('superUserMode', {
        label:   'Super User Mode',
        onText:  'Til',
        offText: 'Fra'
      } as IPropertyPaneToggleProps)
    ];

    if (this.properties.superUserMode) {
      groupFields.push(
        PropertyPaneTextField('selectedUserId', {
          label:       'Bruger (UPN eller GUID)',
          placeholder: 'fx user@contoso.com eller 109996fd-2223-4e1e-a61c-8f68b6e32c58'
        } as IPropertyPaneTextFieldProps)
      );
    }

    return {
      pages: [
        {
          header: {
            description: 'Opsæt webpart'
          },
          groups: [
            {
              groupName:   'Visning & Bruger',
              groupFields: groupFields
            }
          ]
        }
      ]
    };
  }
}