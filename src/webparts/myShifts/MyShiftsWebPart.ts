// src/webparts/myShifts/MyShiftsWebPart.ts
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { IPropertyPaneConfiguration, PropertyPaneDropdown } from '@microsoft/sp-property-pane';
import * as React from 'react';
import * as ReactDom from 'react-dom';
import { MSGraphClientV3 } from '@microsoft/sp-http';

import MyShiftsCalendar from './components/MyShiftsCalendar';
import WeekCalendar from './components/WeekCalendar';

export interface IMyShiftsWebPartProps {
  viewMode: 'day' | 'week';
}

export default class MyShiftsWebPart extends BaseClientSideWebPart<IMyShiftsWebPartProps> {
  private _graphClient!: MSGraphClientV3;
  private _userObjectId!: string;

  public async onInit(): Promise<void> {
    // Hent MSGraphClientV3
    this._graphClient = await this.context.msGraphClientFactory.getClient('3');
    // Hent Azure AD objectId fra konteksten
    this._userObjectId = this.context.pageContext.aadInfo.userId!;
  }

  public render(): void {
    const sharedProps = {
      graphClient: this._graphClient,
      userId: this._userObjectId,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone
    };

    let element: React.ReactElement;
    if (this.properties.viewMode === 'week') {
      element = React.createElement(WeekCalendar, sharedProps);
    } else {
      element = React.createElement(MyShiftsCalendar, sharedProps);
    }

    ReactDom.render(element, this.domElement);
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: {
            description: 'Vælg visning'
          },
          groups: [
            {
              groupName: 'Opsætning',
              groupFields: [
                PropertyPaneDropdown('viewMode', {
                  label: 'Visningstype',
                  options: [
                    { key: 'day', text: 'Dagvisning' },
                    { key: 'week', text: 'Ugekalender' }
                  ]
                })
              ]
            }
          ]
        }
      ]
    };
  }
}
