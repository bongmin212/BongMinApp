// Clear all notification data from localStorage
// Run this in browser console after clearing database

// Clear all notification-related localStorage
localStorage.removeItem('notifications-backup');
localStorage.removeItem('read-notifications');
localStorage.removeItem('archived-notifications-backup');
localStorage.removeItem('notification-settings');

console.log('Cleared all notification localStorage data');

// Verify clearing
console.log('Remaining notification data:', {
  notifications: localStorage.getItem('notifications-backup'),
  read: localStorage.getItem('read-notifications'),
  archived: localStorage.getItem('archived-notifications-backup'),
  settings: localStorage.getItem('notification-settings')
});


