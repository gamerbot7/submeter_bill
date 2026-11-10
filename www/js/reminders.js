/* reminders.js — monthly reminders via Capacitor Local Notifications.
   - Repeating notification on the 1st of every month at the chosen time (survives phone restarts).
   - Optional follow-ups on later days, scheduled ONLY for months that still have no confirmed reading.
   Everything is re-scheduled whenever the app opens or a reading is confirmed. */
const Reminders = (() => {
  const LN = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
  const DAYS = { off: [], standard: [3, 6], frequent: [2, 3, 4, 5, 6, 7] };

  async function ensure(ask) {
    const ln = LN(); if (!ln) return false;
    let p = await ln.checkPermissions();
    if (p.display !== 'granted') {
      if (!ask) return false;
      p = await ln.requestPermissions();
      if (p.display !== 'granted') return false;
    }
    try { await ln.createChannel({ id: 'meter', name: 'Meter reminders', description: 'Monthly reminder to upload the sub-meter photo', importance: 4, visibility: 1, vibration: true }); } catch (e) { /* already exists */ }
    return true;
  }

  async function reschedule(ask) {
    const ln = LN(); if (!ln) return false;
    try {
      if (!(await ensure(!!ask))) return false;
      const pend = await ln.getPending();
      if (pend.notifications.length) await ln.cancel({ notifications: pend.notifications.map(n => ({ id: n.id })) });
      const [h, m] = (S.settings.reminderTime || '09:00').split(':').map(Number);
      const list = [{
        id: 1, title: '📸 Meter reading due',
        body: "It's the 1st — take the sub-meter photo to generate this month's bill.",
        schedule: { on: { day: 1, hour: h, minute: m }, allowWhileIdle: true },
        channelId: 'meter', extra: { route: 'upload' }
      }];
      const now = new Date();
      for (let i = 0; i < 3; i++) {
        const first = new Date(now.getFullYear(), now.getMonth() + i, 1);
        if (hasReading(monthKey(first))) continue;
        (DAYS[S.settings.followUps] || []).forEach(day => {
          const at = new Date(first.getFullYear(), first.getMonth(), day, h, m);
          if (at > now) list.push({
            id: 100 + i * 10 + day, title: '⏰ Meter reading still pending',
            body: 'You have not uploaded the sub-meter reading for ' + monthLabel(monthKey(first)) + ' yet.',
            schedule: { at, allowWhileIdle: true }, channelId: 'meter', extra: { route: 'upload' }
          });
        });
      }
      await ln.schedule({ notifications: list });
      return true;
    } catch (e) { console.warn('reminder schedule failed', e); return false; }
  }

  async function test() {
    const ln = LN(); if (!ln) return false;
    if (!(await ensure(true))) return false;
    await ln.schedule({ notifications: [{ id: 999, title: '✅ Test reminder', body: 'Tap to open the meter upload screen.', schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }, channelId: 'meter', extra: { route: 'upload' } }] });
    return true;
  }
  return { ensure, reschedule, test };
})();
