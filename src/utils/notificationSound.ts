// Notification sound utility
export class NotificationSound {
  private static audioContext: AudioContext | null = null;
  private static isEnabled = true;

  static async init() {
    if (typeof window === 'undefined') return;
    
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (error) {
      console.warn('AudioContext not supported:', error);
    }
  }

  static setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
  }

  static async playNotificationSound(priority: 'low' | 'medium' | 'high' = 'medium') {
    if (!this.isEnabled || !this.audioContext) return;

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      // Different frequencies for different priorities
      const frequencies = {
        low: [400, 500],
        medium: [600, 700],
        high: [800, 1000, 1200]
      };

      const freq = frequencies[priority];
      const duration = 0.1;
      const now = this.audioContext.currentTime;

      // Create a pleasant notification sound
      freq.forEach((f, index) => {
        const osc = this.audioContext!.createOscillator();
        const gain = this.audioContext!.createGain();
        
        osc.connect(gain);
        gain.connect(this.audioContext!.destination);
        
        osc.frequency.setValueAtTime(f, now + index * 0.1);
        osc.type = 'sine';
        
        gain.gain.setValueAtTime(0, now + index * 0.1);
        gain.gain.linearRampToValueAtTime(0.1, now + index * 0.1 + 0.05);
        gain.gain.linearRampToValueAtTime(0, now + index * 0.1 + duration);
        
        osc.start(now + index * 0.1);
        osc.stop(now + index * 0.1 + duration);
      });
    } catch (error) {
      console.warn('Failed to play notification sound:', error);
    }
  }
}
