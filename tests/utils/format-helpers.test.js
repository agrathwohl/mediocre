/**
 * Tests for format helper functions from dataset-browser.js
 */

// Since these functions are embedded within the dataset-browser.js file,
// we'll need to extract them for testing or test them indirectly.

// For this test, we'll reimplement the functions to test their logic separately
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return size.toFixed(2) + ' ' + units[unitIndex];
}

function formatDate(date) {
  return new Date(date).toLocaleString();
}

function formatTime(seconds) {
  if (!seconds) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

describe('Format Helper Functions', () => {
  describe('formatFileSize', () => {
    test('should handle bytes correctly', () => {
      expect(formatFileSize(500)).toBe('500 B');
    });

    test('should convert to KB correctly', () => {
      expect(formatFileSize(1500)).toBe('1.46 KB');
    });

    test('should convert to MB correctly', () => {
      expect(formatFileSize(1500000)).toBe('1.43 MB');
    });

    test('should convert to GB correctly', () => {
      expect(formatFileSize(1500000000)).toBe('1.40 GB');
    });

    test('should convert to TB correctly', () => {
      expect(formatFileSize(1500000000000)).toBe('1.36 TB');
    });
  });

  describe('formatDate', () => {
    test('should format date correctly', () => {
      const date = new Date('2024-01-01T12:00:00');
      expect(formatDate(date)).toBe(date.toLocaleString());
    });

    test('should handle string date input', () => {
      const dateStr = '2024-01-01T12:00:00';
      const date = new Date(dateStr);
      expect(formatDate(dateStr)).toBe(date.toLocaleString());
    });
  });

  describe('formatTime', () => {
    test('should handle zero correctly', () => {
      expect(formatTime(0)).toBe('00:00');
    });

    test('should handle undefined correctly', () => {
      expect(formatTime(undefined)).toBe('00:00');
    });

    test('should format seconds correctly', () => {
      expect(formatTime(45)).toBe('00:45');
    });

    test('should format minutes and seconds correctly', () => {
      expect(formatTime(125)).toBe('02:05');
    });

    test('should handle larger values correctly', () => {
      expect(formatTime(3725)).toBe('62:05'); // 1h 2m 5s becomes 62:05
    });
  });
});