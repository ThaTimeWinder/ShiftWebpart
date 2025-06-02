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

// FluentUI‐imports (husk dem, så DefaultButton, Text, Spinner osv. genkendes)
//import { DefaultButton } from '@fluentui/react';

import MyShiftsCalendar from './components/MyShiftsCalendar';
import WeekCalendar, {
  IShift as IComponentShift,
  IWeekCalendarProps
} from './components/WeekCalendar';

import { IShift as IServiceShift, getShiftsForDay } from './services/ShiftsService';

// Importér print‐CSS
import './PrintOverrides.scss';

export interface IMyShiftsWebPartProps {
  viewMode:        'day' | 'week';
  superUserMode:   boolean;
  selectedUserId:  string;   // UPN eller GUID, hvis superUserMode = true
}

export default class MyShiftsWebPart extends BaseClientSideWebPart<IMyShiftsWebPartProps> {
  private _graphClient!: MSGraphClientV3;
  private _loggedInUserGuid!: string;
  private _selectedUserGuid:    string = '';
  private _currentWeekStart:    DateTime = DateTime.local()
    .startOf('week')
    .plus({ days: 1 }); // Luxon: startOf('week') = søndag, så +1 = mandag.
  private _shiftsForWeek:       IComponentShift[] = [];
  private _isLoading:           boolean = false;

  public async onInit(): Promise<void> {
    // 1) Hent Graph‐klient og logget‐ind‐GUID
    this._graphClient     = await this.context.msGraphClientFactory.getClient('3');
    this._loggedInUserGuid = this.context.pageContext.aadInfo.userId!;

    // 2) Hvis der allerede er en selectedUserId (fra PropertyPane), oversæt til GUID:
    if (this.properties.selectedUserId) {
      await this._resolveSelectedUserGuid(this.properties.selectedUserId);
    }

    // 3) Hent første uges vagter
    await this._loadShiftsForWeek(this._currentWeekStart);
  }

  /**
   * Hvis brugeren skrev en UPN (eller GUID) i PropertyPane‐feltet,
   * så enten bruger vi det direkte (hvis det er en GUID), eller vi slår op i /users/{UPN}.
   */
  private async _resolveSelectedUserGuid(input: string): Promise<void> {
    const guidPattern = /^[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}$/;
    if (guidPattern.test(input)) {
      // Hvis allerede GUID, brug direkte
      this._selectedUserGuid = input;
      return;
    }
    // Ellers antag det er en UPN (eller mail) og slå op i Graph:
    try {
      const user: any = await this._graphClient
        .api(`/users/${encodeURIComponent(input)}`)
        .version('v1.0')
        .select('id')
        .get();
      this._selectedUserGuid = user.id as string;
    } catch (error) {
      console.error(`Kunne ikke finde bruger for "${input}":`, error);
      this._selectedUserGuid = '';
    }
  }

  /**
   * Henter vagter i hele ugen [mandag..søndag].
   * Hvis superUserMode = true OG der er en gyldig _selectedUserGuid,
   * bruges den til at filtrere. Ellers hentes kun for den aktuelle bruger.
   */
  private async _loadShiftsForWeek(weekStart: DateTime): Promise<void> {
    this._isLoading = true;
    this.render(); // Vis spinner under indlæsning

    try {
      const allServiceShifts: IServiceShift[] = [];

      for (let i = 0; i < 7; i++) {
        const singleDay = weekStart.plus({ days: i });
        // Hvis superUserMode aktiv og en valid selectedUserGuid, brug den
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

      // Map fra service‐IShift til komponent‐IShift
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

        // Hvis Graph‐respons indeholder theme (valgfrit), så brug den – ellers fallback til blå
        const theme = srv.sharedShift.theme || 'blue';

        return {
          startTime: startLocal,
          endTime:   endLocal,
          teamName:  teamName,
          isOverlap: false, // Overlap kan beregnes i WeekCalendar
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
    // De props, MyShiftsCalendar bruger (dag‐visning):
    const sharedCalProps = {
      graphClient: this._graphClient,
      userId:      this._loggedInUserGuid,
      tz:          Intl.DateTimeFormat().resolvedOptions().timeZone
    };

    // Vælg om vi skal vise uge‐ eller dag‐komponenten
    let innerElement: React.ReactElement;
    if (this.properties.viewMode === 'week') {
      // Byg props til WeekCalendar
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
          // Når superUser vælger en anden bruger i PeoplePicker, opdateres selectedUserId i properties + hent ny uge
          this.properties.selectedUserId = newUserId;
          await this._resolveSelectedUserGuid(newUserId);
          await this._loadShiftsForWeek(this._currentWeekStart);
        },
        graphClient:    this._graphClient
      };
      innerElement = React.createElement(WeekCalendar, weekProps);
    } else {
      // Dagvist‐mode
      innerElement = React.createElement(MyShiftsCalendar, sharedCalProps);
    }

    // *** Her omslutter vi ALT i <div id="printArea"> … </div> ***
    // Din print‐CSS sørger for, at ALT uden for #printArea bliver skjult ved print.
    const wrapper = (
      <div id="printArea2">
        { /* ---------- SUPER USER SEARCH (kun når mode = true) ---------- */ }
        {this.properties.superUserMode && (
          <div style={{ marginBottom: '1rem' }}>
            { /* PeoplePicker vises faktisk inde i WeekCalendar, 
                 men du kan evt. fjerne den herfra, hvis du kun vil have 
                 søgefeltet direkte i webpart’en. I eksemplet bruger vi 
                 PeoplePicker i WeekCalendar, så vi lader den være i komponenten. */ }
          </div>
        )}

        { /* ---------- NAVIGATION + UGE‐OVERSKRIFT ELLER DAG‐OVERSKRIFT ---------- */ }
        

        {innerElement}
      </div>
    );

    ReactDom.render(wrapper, this.domElement);
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

  private async _onRefresh(): Promise<void> {
    // Ryd cache for alle syv dage i den nuværende uge ‒ specifikt for den bruger, vi loader
    const effectiveUserGuid =
      this.properties.superUserMode && this._selectedUserGuid
        ? this._selectedUserGuid
        : this._loggedInUserGuid;

    for (let i = 0; i < 7; i++) {
      const d = this._currentWeekStart.plus({ days: i }).toISODate();
      if (d) {
        const cacheKey = `shifts-${d}-${effectiveUserGuid}`;
        window.sessionStorage.removeItem(cacheKey);
      }
    }
    await this._loadShiftsForWeek(this._currentWeekStart);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    // Dropdown‐muligheder til dag/uge
    const dropdownOptions: IPropertyPaneDropdownOption[] = [
      { key: 'day',  text: 'Dagvisning' },
      { key: 'week', text: 'Ugekalender' }
    ];

    // Gruppér felter – vi tilføjer toggle til SuperUser og (hvis slået til) TextField til brugerinput
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
