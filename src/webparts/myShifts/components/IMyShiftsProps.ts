export interface IMyShiftsProps {
  description: string;
  isDarkTheme: boolean;
  environmentMessage: string;
  hasTeamsContext: boolean;
  userDisplayName: string;
  viewMode: 'day' | 'week';
  superUserMode: boolean; // If true, use selectedUserId instead of "/me"
  selectedUserId: string; // User's UPN or ObjectId, e.g., "
}
