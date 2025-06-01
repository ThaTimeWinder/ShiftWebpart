// src/webparts/myShifts/MyShiftsWebPart.ts

import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import {
  IPropertyPaneConfiguration,
  PropertyPaneDropdown,
  IPropertyPaneDropdownOption
} from '@microsoft/sp-property-pane';
import * as React from 'react';
import * as ReactDom from 'react-dom';
import { MSGraphClientV3 } from '@microsoft/sp-http';

import MyShiftsCalendar, { IMyShiftsCalendarProps } from './components/MyShiftsCalendar';

export interface IMyShiftsWebPartProps {
  viewMode: 'day' | 'week';
}

export default class MyShiftsWebPart extends BaseClientSideWebPart<IMyShiftsWebPartProps> {
  private _graphClient!: MSGraphClientV3;
  private _userObjectId!: string;

  public async onInit(): Promise<void> {
    // Hent MSGraphClientV3
    this._graphClient = await this.context.msGraphClientFactory.getClient('3');

    // Hent korrekt Azure AD GUID fra context (ikke legacyPageContext.userId)
    const aadGuid = this.context.pageContext.aadInfo?.userId;
    if (aadGuid) {
      this._userObjectId = aadGuid;
    } else {
      // Fallback: udtræk af loginName (hvis aadInfo.userId er undefined)
      const loginName = this.context.pageContext.user.loginName || '';
      const parts = loginName.split('|');
      this._userObjectId = parts.length >= 3 ? parts[2] : '';
    }
  }

  public render(): void {
    const elementProps: IMyShiftsCalendarProps = {
      graphClient: this._graphClient,
      userId: this._userObjectId,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      viewMode: this.properties.viewMode // "day" eller "week"
    };

    const element = React.createElement(MyShiftsCalendar, elementProps);
    ReactDom.render(element, this.domElement);
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    const dropdownOptions: IPropertyPaneDropdownOption[] = [
      { key: 'day', text: 'Dags-visning' },
      { key: 'week', text: 'Uge-visning' }
    ];

    return {
      pages: [
        {
          header: { description: 'Vælg visnings-mode' },
          groups: [
            {
              groupName: 'Visning',
              groupFields: [
                PropertyPaneDropdown('viewMode', {
                  label: 'Vis som:',
                  options: dropdownOptions
                })
              ]
            }
          ]
        }
      ]
    };
  }
}
