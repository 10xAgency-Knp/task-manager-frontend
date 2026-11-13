/* ============================================================
   10X Agency CRM - service worker (v3.3 push notifications)
   Shows push notifications from the CRM server even when the CRM tab is
   closed or the person is working in another app (the browser must be
   running). Nothing is cached here: the CRM always loads fresh from the server.
   ============================================================ */
"use strict";
self.addEventListener("install", function() { self.skipWaiting(); });
self.addEventListener("activate", function(e) { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", function(e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: "10X Agency CRM", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(list) {
    /* tell open CRM tabs to refresh their bell */
    list.forEach(function(c) { try { c.postMessage({ type: "crm-push", data: d }); } catch (x) {} });
    /* the CRM is on screen right now: it shows its own popup, no second notification */
    if (list.some(function(c) { return c.visibilityState === "visible" && c.focused; })) return;
    return self.registration.showNotification(d.title || "10X Agency CRM", {
      body: d.body || "",
      tag: d.tag || undefined,
      icon: "assets/img/icon-192.png",
      badge: "assets/img/badge-72.png",
      data: { url: d.url || "#/notifications" },
      requireInteraction: false
    });
  }));
});

self.addEventListener("notificationclick", function(e) {
  e.notification.close();
  var hash = (e.notification.data && e.notification.data.url) || "#/notifications";
  if (!/^#[A-Za-z0-9_\-\/]*$/.test(hash)) hash = "#/notifications";          // only links inside the CRM
  var target = self.registration.scope + hash;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf(self.registration.scope) === 0) {
        try { c.postMessage({ type: "crm-open", url: hash }); } catch (x) {}
        return c.focus();
      }
    }
    return self.clients.openWindow(target);
  }));
});
