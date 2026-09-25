import {
  sendNotification as tauriSendNotification,
  isPermissionGranted as tauriIsPermissionGranted,
  requestPermission as tauriRequestPermission,
} from "@tauri-apps/plugin-notification";

export const notificationService = {
  async notify(title: string, body: string): Promise<void> {
    let allowed = await tauriIsPermissionGranted();
    if (!allowed) {
      const permission = await tauriRequestPermission();
      allowed = permission === "granted";
    }
    if (allowed) {
      tauriSendNotification({ title, body });
    }
  },
};

// --------------------------------------------------------------------------
// Named exports (keep backward compatibility + convenience wrappers)
// --------------------------------------------------------------------------

export async function requestPermission(): Promise<boolean> {
  let allowed = await tauriIsPermissionGranted();
  if (!allowed) {
    const permission = await tauriRequestPermission();
    allowed = permission === "granted";
  }
  return allowed;
}

export async function sendNotification(title: string, body: string): Promise<void> {
  await notificationService.notify(title, body);
}

export async function notifyInterviewReminder(
  companyName: string,
  interviewType: string,
  scheduledAt: Date,
): Promise<void> {
  const title = `Interview Reminder: ${companyName}`;
  const body = `${interviewType} interview scheduled for ${scheduledAt.toLocaleString()}`;
  await sendNotification(title, body);
}

export async function notifyNewJobs(count: number, source: string): Promise<void> {
  if (count > 0) {
    await sendNotification(
      "New Jobs Found",
      `${count} new jobs found from ${source}`,
    );
  }
}

export async function notifyScrapeComplete(
  totalFound: number,
  totalNew: number,
): Promise<void> {
  await sendNotification(
    "Scrape Complete",
    `Found ${totalFound} jobs (${totalNew} new)`,
  );
}
