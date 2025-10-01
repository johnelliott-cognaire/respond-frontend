// utils/date-utils.js
// Utility: Date Helpers
export function formatDate(date) {
  return new Date(date).toLocaleDateString();
}



/**
 * Format a date string into a human-readable format using browser's local timezone.
 * 
 * @param {string|Date} dateInput - The input date string or Date object.
 * @param {boolean} compact - Whether to use compact format (no weekday). Default is false.
 * @returns {string} Formatted date string with local timezone.
 */
export default function formatHumanReadableDate(dateInput, compact = false) {
  if (!dateInput) return '';

  let date;
  try {
    // Parse the input date
    date = typeof dateInput === 'string' ? new Date(dateInput) : new Date(dateInput);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
  } catch (e) {
    return 'Invalid Date';
  }

  // Now check how recent the date is
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  
  const isToday = 
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  
  const isYesterday = 
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();
  
  // For today and yesterday, show a more friendly format
  if (isToday) {
    const timeOptions = { hour: 'numeric', minute: 'numeric', hour12: true };
    return `Today, ${date.toLocaleString('en-US', timeOptions)}`;
  }
  
  if (isYesterday) {
    const timeOptions = { hour: 'numeric', minute: 'numeric', hour12: true };
    return `Yesterday, ${date.toLocaleString('en-US', timeOptions)}`;
  }

  // Format options according to our standardized format
  const options = {
    weekday: compact ? undefined : 'short',
    day: 'numeric', 
    month: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  };

  // Using toLocaleString with browser's default timezone
  return date.toLocaleString('en-US', options);
}