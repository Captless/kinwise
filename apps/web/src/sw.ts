/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("push", (e) => {
  e.waitUntil(
    self.registration.showNotification("Medication reminder", {
      body: "Open the app to review your schedule.",
      tag: "med-reminder",
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (wins.length) await wins[0].focus();
      else await self.clients.openWindow("/");
    })(),
  );
});
