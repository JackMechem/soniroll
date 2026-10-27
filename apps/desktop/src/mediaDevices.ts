/** The desktop app lists and opens audio devices natively (`native/audioInput.ts`), so the
    webview's own media-device API is switched off. On Linux, WebKitGTK answers even a
    "devicechange" listener (the Tuner and the trainers add one) by asking the desktop's camera
    portal, which pops up an "Allow apps to use the camera?" dialog.

    Patched on `MediaDevices.prototype`, not on `navigator.mediaDevices`: WebKitGTK rebuilds that
    object's JavaScript wrapper some time after start-up, which drops anything set on it. */
export function installMediaDevices() {
  if (typeof MediaDevices === "undefined") return;
  const proto = MediaDevices.prototype as MediaDevices & EventTarget;
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  type Args = Parameters<EventTarget["addEventListener"]>;
  proto.addEventListener = function (this: EventTarget, ...[type, listener, options]: Args) {
    if (type !== "devicechange") add.call(this, type, listener, options);
  };
  proto.removeEventListener = function (this: EventTarget, ...[type, listener, options]: Args) {
    if (type !== "devicechange") remove.call(this, type, listener, options);
  };
  proto.enumerateDevices = async () => [];
}
